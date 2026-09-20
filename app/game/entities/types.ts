/* Characters on the map.

   An entity stands on a tile and is drawn as a flat sprite facing the
   camera. Its logical position is a cell; while it walks, `motion` carries
   the interpolation between two cells so the renderer can place it between
   tiles without the simulation ever being in a half-way state. */

import type { Cell } from '../map/navigation';

export type Faction = 'player' | 'enemy';
export type AnimationState = 'idle' | 'walk' | 'attack' | 'ranged' | 'hurt' | 'die';

export interface AnimationClip {
  /** Frames in the cycle, laid out left to right on the sheet. */
  frames: number;
  fps: number;
  loop: boolean;
  /** Row of the sprite sheet this clip lives on. */
  sheetRow: number;
}

export type AnimationSet = Record<AnimationState, AnimationClip>;

/* A sheet with one picture per character has no frames to cycle, so every
   state is a single frame and `fps` sets how long that state lasts: attack
   holds for a third of a second, dying for half. Those durations are what
   `isBusy` waits on, so they pace the enemy phase. The renderer gives the
   still art its movement — a bob, a lunge, a recoil — until real frames
   exist, at which point only these numbers change. */
export const STATIC_ANIMATIONS: AnimationSet = {
  idle: { frames: 1, fps: 1, loop: true, sheetRow: 0 },
  walk: { frames: 1, fps: 1, loop: true, sheetRow: 0 },
  attack: { frames: 1, fps: 3, loop: false, sheetRow: 0 },
  ranged: { frames: 1, fps: 3, loop: false, sheetRow: 0 },
  hurt: { frames: 1, fps: 4, loop: false, sheetRow: 0 },
  die: { frames: 1, fps: 2, loop: false, sheetRow: 0 },
};

export const DEFAULT_ANIMATIONS: AnimationSet = {
  idle: { frames: 4, fps: 6, loop: true, sheetRow: 0 },
  walk: { frames: 6, fps: 12, loop: true, sheetRow: 1 },
  attack: { frames: 4, fps: 14, loop: false, sheetRow: 2 },
  ranged: { frames: 4, fps: 14, loop: false, sheetRow: 2 },
  hurt: { frames: 2, fps: 10, loop: false, sheetRow: 3 },
  die: { frames: 4, fps: 8, loop: false, sheetRow: 4 },
};

/** The box a character is drawn into, in design units. The art keeps its
 *  aspect ratio and is fitted inside, standing on the bottom edge. */
export interface Footprint {
  width: number;
  height: number;
}

/** Where a character's picture comes from.
 *
 *  `sheet` points at a cell of a real sprite sheet; the render layer maps
 *  the sheet key to a file, so nothing in game/ knows about asset URLs.
 *  `placeholder` is the procedural stand-in, still used where there is no
 *  art yet. Both carry a footprint, so swapping one for the other changes
 *  how a character looks and nothing about how big it is. */
export type SpriteStyle =
  | {
      kind: 'sheet';
      /** Key into the render layer's sheet registry. */
      sheet: string;
      /** Cell in that sheet's grid. */
      col: number;
      row: number;
      /** Which way the artwork already points. */
      faces: 1 | -1;
      footprint: Footprint;
      /** Nudge the artwork off the tile, in design units, positive down.
       *  For art whose feet do not sit where its measured extent implies —
       *  a trailing shadow or a scuff baked into the frame will read as
       *  ground, and the character ends up hovering without it. */
      offsetY?: number;
    }
  | {
      kind: 'placeholder';
      build: 'humanoid' | 'beast' | 'hulk';
      body: string;
      trim: string;
      accent: string;
      faces: 1 | -1;
      footprint: Footprint;
      offsetY?: number;
    };

export interface EntityDefinition {
  id: string;
  name: string;
  faction: Faction;
  maxHp: number;
  /** Cells it can cover in one of its turns. */
  moveRange: number;
  attackRange: number;
  attackDamage: number;
  sprite: SpriteStyle;
  animations: AnimationSet;
  /** Enemy behaviour is a deck too: one intent is drawn each enemy phase. */
  intents: string[];
}

export interface Motion {
  from: Cell;
  to: Cell;
  /** 0..1 across the step. */
  t: number;
  /** Steps per second. */
  speed: number;
}

export interface Entity {
  id: string;
  defId: string;
  faction: Faction;
  row: number;
  col: number;
  hp: number;
  maxHp: number;
  block: number;
  /** Bonus damage from intents like Empower. */
  power: number;
  /** +1 faces down-right along the ribbon, -1 faces back up it. */
  facing: 1 | -1;
  anim: { state: AnimationState; frame: number; elapsed: number; done: boolean };
  motion: Motion | null;
  /** Remaining steps of a walk in progress. */
  path: Cell[];
  /** The enemy's telegraphed action for the coming phase. */
  intent: { cardId: string; label: string } | null;
  dead: boolean;
}

export const entityCell = (entity: Entity): Cell => ({ row: entity.row, col: entity.col });

export function setAnimation(entity: Entity, state: AnimationState): void {
  if (entity.anim.state === state) return;
  entity.anim = { state, frame: 0, elapsed: 0, done: false };
}

/** Advance one entity's clock: frames, and any step it is part-way through.
 *  Returns true when a step completed, so the caller can pull the next one. */
export function advanceAnimation(entity: Entity, clip: AnimationClip, dt: number): void {
  const anim = entity.anim;
  if (anim.done) return;
  anim.elapsed += dt;
  const frameTime = 1 / clip.fps;
  while (anim.elapsed >= frameTime) {
    anim.elapsed -= frameTime;
    if (anim.frame + 1 < clip.frames) anim.frame += 1;
    else if (clip.loop) anim.frame = 0;
    else {
      anim.done = true;
      break;
    }
  }
}
