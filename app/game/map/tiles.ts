/* Tile vocabulary and zones.

   A cell is a STACK of tiles written bottom-to-top as a string, the same
   shorthand the prototype used:

       'G'     one ground tile on the baseline
       'GGD'   two ground with a trail cap, three layers high
       'GW'    water, its surface one layer up
       'GRR'   ground with a rock outcrop on top — impassable
       ''      nothing: open air, the gap in a fork

   The letters are SEMANTIC, not visual. A zone supplies the palette, so
   the generator can reason about ground and trail while the marsh and the
   highlands look nothing alike. */

export type TileLetter = "G" | "D" | "W" | "R";
export type TileKind = "ground" | "trail" | "water" | "rock";

export type Stack = string;
export const VOID: Stack = "";

export const KIND_OF: Record<TileLetter, TileKind> = {
  G: "ground",
  D: "trail",
  W: "water",
  R: "rock",
};

/** The kind an entity would be standing on, or null for open air. */
export function surfaceKind(stack: Stack): TileKind | null {
  if (!stack) return null;
  return KIND_OF[stack[stack.length - 1] as TileLetter] ?? null;
}

/** Ground and trail carry weight; water and rock do not. */
export function isWalkable(stack: Stack): boolean {
  const kind = surfaceKind(stack);
  return kind === "ground" || kind === "trail";
}

/** How high the surface of a stack sits, in layers. */
export const stackHeight = (stack: Stack): number => stack.length;

export interface FacePalette {
  top: string;
  left: string;
  right: string;
  /** Surface offset in design units: negative sinks, as water does. */
  elev: number;
  texture: "blades" | "speckle" | "ripple" | "grain" | "none";
}

export interface ZoneGenParams {
  /** Layers of terrain height this zone varies between. */
  minHeight: number;
  maxHeight: number;
  /** Per-row odds the ribbon splits around a gap, where it is wide enough. */
  forkChance: number;
  /** Per-row odds a fork closes again. */
  mergeChance: number;
  /** Per-edge-cell odds of water, and of a rock outcrop. */
  waterChance: number;
  rockChance: number;
  /** How readily the ribbon narrows and widens. */
  widthDrift: number;
  /** Per-row odds the far side of a strand rears up into a peak. */
  peakChance: number;
  /** How many layers a peak adds on top of the terrain height. */
  peakHeight: number;
}

export interface Zone {
  id: string;
  name: string;
  palette: Record<TileKind, FacePalette>;
  /** Which enemy definitions spawn here. */
  enemies: string[];
  /** Enemies per chunk. */
  density: number;
  gen: ZoneGenParams;
}

export const ZONES: Zone[] = [
  {
    id: "meadow",
    name: "North Basin",
    enemies: ["slime", "chicken", "bug"],
    density: 3,
    palette: {
      ground: {
        top: "#8fb063",
        left: "#5f8046",
        right: "#4b6838",
        elev: 0,
        texture: "blades",
      },
      trail: {
        top: "#c1945f",
        left: "#956a42",
        right: "#7a5533",
        elev: 0,
        texture: "speckle",
      },
      water: {
        top: "#6ea9ad",
        left: "#477f85",
        right: "#39666d",
        elev: -5,
        texture: "ripple",
      },
      rock: {
        top: "#8d9498",
        left: "#646c71",
        right: "#4e565b",
        elev: 0,
        texture: "grain",
      },
    },
    gen: {
      minHeight: 1,
      maxHeight: 4,
      forkChance: 0.18,
      mergeChance: 0.25,
      waterChance: 0.16,
      rockChance: 0.06,
      widthDrift: 0.6,
      peakChance: 0.08,
      peakHeight: 2,
    },
  },
  {
    id: "marsh",
    name: "Sunken Reach",
    enemies: ["slime", "bug", "spider"],
    density: 4,
    palette: {
      ground: {
        top: "#6f8a56",
        left: "#4a6340",
        right: "#3a5134",
        elev: 0,
        texture: "blades",
      },
      trail: {
        top: "#9b7f52",
        left: "#735c3a",
        right: "#5c482d",
        elev: 0,
        texture: "speckle",
      },
      water: {
        top: "#5d8f86",
        left: "#3d6b66",
        right: "#315854",
        elev: -6,
        texture: "ripple",
      },
      rock: {
        top: "#77807f",
        left: "#565f5f",
        right: "#434b4b",
        elev: 0,
        texture: "grain",
      },
    },
    gen: {
      minHeight: 1,
      maxHeight: 3,
      forkChance: 0.3,
      mergeChance: 0.2,
      waterChance: 0.34,
      rockChance: 0.04,
      widthDrift: 0.7,
      peakChance: 0.04,
      peakHeight: 1,
    },
  },
  {
    id: "highlands",
    name: "Pale Shelf",
    enemies: ["wolf", "spider", "dragon"],
    density: 3,
    palette: {
      ground: {
        top: "#a8b189",
        left: "#78805f",
        right: "#616849",
        elev: 0,
        texture: "blades",
      },
      trail: {
        top: "#c9ad82",
        left: "#9c8259",
        right: "#7e6845",
        elev: 0,
        texture: "speckle",
      },
      water: {
        top: "#7fa8b5",
        left: "#567f8c",
        right: "#456972",
        elev: -5,
        texture: "ripple",
      },
      rock: {
        top: "#9aa0a6",
        left: "#70767c",
        right: "#585e64",
        elev: 0,
        texture: "grain",
      },
    },
    gen: {
      minHeight: 2,
      maxHeight: 7,
      forkChance: 0.12,
      mergeChance: 0.3,
      waterChance: 0.08,
      rockChance: 0.14,
      widthDrift: 0.55,
      peakChance: 0.22,
      peakHeight: 3,
    },
  },
];

/** Rows each zone occupies. A multiple of CHUNK_ROWS keeps zone edges on
 *  chunk boundaries, so a chunk only ever belongs to one zone. */
export const ZONE_ROWS = 48;

/** The map is finite: every zone once, in order, and then the far end. */
export const MAP_ROWS = ZONES.length * ZONE_ROWS;

/** The row that ends the run. */
export const LAST_ROW = MAP_ROWS - 1;

/** Where a run begins — a little way in, not on the very edge. */
export const START_ROW = 1;

/* Zones do not cycle. Past the last one the map is over, so anything asking
   beyond the end gets the final zone rather than starting again. */
export function zoneForRow(row: number): Zone {
  const index = Math.floor(Math.max(0, row) / ZONE_ROWS);
  return ZONES[Math.min(index, ZONES.length - 1)]!;
}

/** Tallest a stack can be anywhere: terrain, plus a peak, plus an outcrop.
 *  Culling needs it, so it lives with the numbers it comes from. */
export const MAX_STACK_HEIGHT =
  Math.max(...ZONES.map((zone) => zone.gen.maxHeight + zone.gen.peakHeight)) +
  1;
