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

/** How a zone's ground is shaped. Content (`terrain` on a zone). */
export interface ZoneTerrain {
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

/** One chunk of a zone: 16 rows, and who lives in them. */
export interface ZoneChunk {
  /** Which enemy definitions spawn here at random. A name listed twice is
   *  twice as likely. */
  enemies: string[];
  /** How many are drawn for this chunk. */
  density: number;
  /** One of these, chosen at random, stands on the chunk's last row. On a
   *  zone's last chunk it holds the way down; anywhere else it is a
   *  sub-boss. Empty: nobody. */
  guardians: string[];
}

/* A zone is a floor: its name, how it looks, how its ground is shaped, and
   its chunks in order. All of it is content (content/zones.json, in floor
   order), installed into ZONES by `installContent`. */
export interface Zone {
  id: string;
  name: string;
  palette: Record<TileKind, FacePalette>;
  terrain: ZoneTerrain;
  /** The floor's chunks, first to last. At least one. */
  chunks: ZoneChunk[];
}

/** Rows in one chunk. Zones are whole chunks, so a chunk only ever belongs
 *  to one zone — and one floor, which is what lets a floor populate each of
 *  its chunks exactly once, as the player arrives. */
export const CHUNK_ROWS = 16;

/** Every zone, in floor order. The same array for the life of the page:
 *  `installContent` empties and refills it, never reassigns it. */
export const ZONES: Zone[] = [];

/* Where each floor lies in the one continuous world. Floors are their
   zones' chunks back to back, so a floor's length follows its zone. Worked
   out by `layoutZones` whenever zones are installed, and — like ZONES — the
   same object for the life of the page. */
export const LAYOUT = {
  /** How many floors a run goes down through: one per zone. */
  floors: 0,
  /** Each floor's first row, and its first chunk's index. */
  firstRow: [] as number[],
  firstChunk: [] as number[],
  /** The last row of the last floor, where the way out waits. */
  lastRow: -1,
  /** Tallest a stack can be anywhere: terrain, plus a peak, plus an
   *  outcrop. Culling needs it. */
  maxStack: 1,
};

export function layoutZones(): void {
  LAYOUT.floors = ZONES.length;
  LAYOUT.firstRow.length = 0;
  LAYOUT.firstChunk.length = 0;
  let chunk = 0;
  for (const zone of ZONES) {
    LAYOUT.firstChunk.push(chunk);
    LAYOUT.firstRow.push(chunk * CHUNK_ROWS);
    chunk += zone.chunks.length;
  }
  LAYOUT.lastRow = chunk * CHUNK_ROWS - 1;
  LAYOUT.maxStack = Math.max(1, ...ZONES.map((zone) => zone.terrain.maxHeight + zone.terrain.peakHeight)) + 1;
}

/* Floors. Each zone is a floor of its own, like a level of a dungeon: the
   run goes down through them in order, and only the one the player is on
   exists while he is on it — the map ends at its first and last rows. A
   floor is simply its zone's rows of the one continuous world, so the
   generator, its invariants and every seed are untouched, and analytics
   still count depth in rows. */

/** The rows a floor spans: its zone's, from its canonical first row to the
 *  canonical last row its guardian holds. */
export function floorRows(floor: number): { first: number; last: number } {
  const first = LAYOUT.firstRow[floor] ?? 0;
  const chunks = ZONES[floor]?.chunks.length ?? 0;
  return { first, last: first + chunks * CHUNK_ROWS - 1 };
}

/** The row a zone's last guardian holds: the last row of that zone. Every
 *  zone boundary is also a chunk boundary, so this is always a canonical
 *  row — full width, trail across the middle. */
export const gateRowOf = (zoneIndex: number): number => floorRows(zoneIndex).last;

/** Which floor a row lies on. Past the last one the map is over, so
 *  anything asking beyond the end gets the final floor: zones do not cycle. */
export function floorOfRow(row: number): number {
  let floor = 0;
  for (let i = 1; i < LAYOUT.firstRow.length; i += 1) if (row >= LAYOUT.firstRow[i]!) floor = i;
  return floor;
}

export const zoneForRow = (row: number): Zone => ZONES[floorOfRow(row)]!;

/** A chunk's place: its floor, and which of that floor's chunks it is,
 *  counting from 0. */
export function chunkOfFloor(chunkIndex: number): { floor: number; k: number } {
  const floor = floorOfRow(chunkIndex * CHUNK_ROWS);
  return { floor, k: chunkIndex - (LAYOUT.firstChunk[floor] ?? 0) };
}

/** How far into each floor the player arrives — a little way in, not on the
 *  very edge, so there is map behind him and the view is not half empty. */
export const START_ROW = 1;
