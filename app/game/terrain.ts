/* Terrain types: what a marked tile is — Fire, Oil, a healing Spring.

   Each is content (`content/terrain.json`), defined once and named by every
   card, gem, talisman or enemy that marks a tile with it (`type` on a
   terrain effect). The card says what the tile does and for how long — one
   fire hurts for 2, another for 3 — and the type says what it is: its name,
   how it looks, and whether it counts as fire.

   `fire` is what the fire cards and stats look for: heat (`fireDamage`,
   `fireMultiplier`), longer burning (`fireRounds`), the ward, Rekindle,
   Flare, and the `fires` amount all act on every mark whose type counts as
   fire, whoever made it. A new kind of flame is a new type with the flag.

   The look is plain data for the renderer (`render/marks.ts`), like a
   sprite's footprint: no drawing happens here. */

export const MARK_SHAPES = ['circle', 'square', 'diamond', 'triangle', 'hexagon', 'star', 'cross', 'ring'] as const;
export type MarkShape = (typeof MARK_SHAPES)[number];

/** How a mark is drawn: a plate floating over the tile, a glow joining it
 *  to the ground, and motes rising off it. Distances are design units. */
export interface MarkLook {
  colour: string;
  shape: MarkShape;
  /** How wide the plate is, as a share of the tile. */
  size: number;
  /** How high it floats above the tile. */
  height: number;
  /** Turns a second, flat on the ground; negative turns the other way. */
  spin: number;
  /** How quickly it bobs up and down, and by how much. */
  bounceSpeed: number;
  bounceHeight: number;
  /** Motes in the air at once, and how far each rises before it fades. */
  particles: number;
  particleHeight: number;
  /** The motes' colour; the mark's own if left out. */
  particleColour?: string;
  /** The plate's rim: how thick, and its colour (the mark's own if left
   *  out). 0 for no rim. */
  border: number;
  borderColour?: string;
}

/** Today's look, before looks could be chosen: a turning-free circle,
 *  bobbing gently, with nine motes. Every new type starts here. */
export const DEFAULT_LOOK: MarkLook = {
  colour: '#ffffff',
  shape: 'circle',
  size: 0.62,
  height: 11,
  spin: 0,
  bounceSpeed: 2,
  bounceHeight: 2,
  particles: 9,
  particleHeight: 38,
  border: 1.5,
};

export interface TerrainType {
  id: string;
  name: string;
  /** For the tile's tooltip when the mark itself does nothing to whoever
   *  stands there — oil, say: what it is for. */
  text?: string;
  /** Counts as fire: heated, lengthened, warded, flared and counted by the
   *  fire cards and stats. */
  fire?: boolean;
  look: MarkLook;
}

/** Every terrain type, by id. The same object for the life of the page:
 *  `installContent` empties and refills it. */
export const TERRAIN: Record<string, TerrainType> = {};

/** A type by id. A mark naming one that is not there (a test's own card,
 *  say) is drawn plain and is not fire. */
export function terrainType(id: string | undefined): TerrainType | undefined {
  return id ? TERRAIN[id] : undefined;
}

/** Does a mark of this type count as fire? */
export const isFireType = (id: string | undefined): boolean => !!terrainType(id)?.fire;
