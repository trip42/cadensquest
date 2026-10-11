/* Aura types: what a marked tile is — Fire, Oil, a healing Spring.

   Each is content (`content/auras.json`), defined once and named by every
   card, gem, talisman or enemy that marks a tile with it (`type` on an
   aura effect). The card says what the tile does and for how long — one
   fire hurts for 2, another for 3 — and the type says what it is: its name,
   how it looks, and what it does when it meets other types.

   Nothing about any type is written in code. What heats, lengthens, wards,
   pulses or counts the marks of a type names that type: the aura stats
   (`auraDamage` and the rest, with an `aura`), Prolong and Pulse, and the
   `auras` amount. Fire is simply the type those cards name.

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

/* What a mark of one type does when it meets a mark of another on a tile,
   whichever was laid first. Content, not code: fire and oil are two types
   and one reaction.

     spreadsThrough  takes the whole connected patch of the other at once,
                     using it up (fire through an oil slick)
     removes         takes the other off the tile (water puts out fire); a
                     mark it removes is never laid on it
     cancels         both go
     refuses         cannot be laid where the other is */
export const REACTION_KINDS = ['spreadsThrough', 'removes', 'cancels', 'refuses'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

/** How each reaction reads, between the two types' names: "Fire spreads
 *  through every connected Oil". */
export const REACTION_TEXT: Record<ReactionKind, string> = {
  spreadsThrough: 'spreads through every connected',
  removes: 'removes',
  cancels: 'cancels out with',
  refuses: 'cannot be laid on',
};

export interface Reaction {
  does: ReactionKind;
  /** The other aura type. */
  with: string;
}

export interface AuraType {
  id: string;
  name: string;
  /** For the tile's tooltip when the mark itself does nothing to whoever
   *  stands there — oil, say: what it is for. */
  text?: string;
  /** What it does when it meets other types on a tile. */
  reactions?: Reaction[];
  /** Each round, the chance it creeps onto each neighbouring tile — a copy
   *  lasting a round less than it has left, so a spread dies out. */
  spread?: number;
  look: MarkLook;
}

/** Every aura type, by id. The same object for the life of the page:
 *  `installContent` empties and refills it. */
export const AURAS: Record<string, AuraType> = {};

/** A type by id. A mark naming one that is not there (a test's own card,
 *  say) is drawn plain. */
export function auraType(id: string | undefined): AuraType | undefined {
  return id ? AURAS[id] : undefined;
}
