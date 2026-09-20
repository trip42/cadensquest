/* Procedural map generation.

   The map is an endless ribbon of MAP_WIDTH columns, generated in chunks
   of CHUNK_ROWS. The prototype hand-authored a braid and then CHECKED that
   it was continuous; a generator cannot work that way, because a check that
   fails at runtime still means a broken world on someone's screen. So the
   braid here is correct BY CONSTRUCTION:

     - a strand never narrows below MIN_STRAND columns
     - a strand only ever shifts its edges by one column per row, so
       consecutive rows always overlap and the land stays connected
     - a fork is only cut from a strand wide enough to leave two legal
       strands either side of the gap, and the trail is widened on the row
       ABOVE the cut so both branches inherit a connected path
     - water and rock only ever replace an edge column of a wide strand,
       so the walkable interval stays contiguous

   The first and last row of every chunk are canonical: full width, with the
   trail crossing the centre. That makes chunks independent — chunk N is a
   pure function of (seed, N) and can be built, dropped and rebuilt in any
   order, while still joining seamlessly to its neighbours. */

import { chance, createRng, hashSeed, nextInt, type Rng } from '../rng';
import { type Stack, VOID, type Zone, zoneForRow } from './tiles';

export const MAP_WIDTH = 10;
export const CHUNK_ROWS = 16;
/* A strand may get this narrow, and a fork's void this wide. Dropping the
   strand minimum is what makes room for both: at ten columns across, a
   fork needs 2 x MIN_STRAND + MIN_GAP to fit. */
export const MIN_STRAND = 3;
export const MIN_GAP = 3;
/** Columns the trail must cross on a canonical row, so chunks join up. */
export const SEAM_TRAIL: [number, number] = [4, 5];

/* Terrain height is the one thing that can make a map impassable: a step of
   more than one layer is a climb, not a walk. Two rules keep a route open
   from the first row to the last.

   One, the trail is never built on. Ridges and peaks only rise beyond the
   trail's own columns, so walking the trail is never a climb.

   Two, height changes by at most a layer per row, and is pulled back to the
   chunk's canonical height in time to meet the next chunk — otherwise a
   chunk ending high would butt against one starting low and wall the map
   off at the seam. */
interface Strand {
  /** Inclusive column range of solid land. */
  lo: number;
  hi: number;
  /** Column the trail leaves this row on. */
  trail: number;
  /** Inclusive column range the trail occupies on this row. */
  spanLo: number;
  spanHi: number;
  /** Terrain height in layers, and whether the far half steps up one. */
  height: number;
  ridge: boolean;
  /** Extra layers heaped beyond the trail, for a peak. */
  peak: number;
}

const width = (strand: Strand) => strand.hi - strand.lo + 1;

/** A full-width row with the trail across the middle: every chunk starts
 *  and ends on one of these, which is what makes chunks independent. */
function canonicalStrand(height: number): Strand {
  return {
    lo: 0,
    hi: MAP_WIDTH - 1,
    trail: SEAM_TRAIL[0],
    spanLo: SEAM_TRAIL[0],
    spanHi: SEAM_TRAIL[1],
    height,
    ridge: false,
    peak: 0,
  };
}

/** Move a strand's edges by at most one column, keeping it legal. */
function drift(strand: Strand, rng: Rng, zone: Zone): Strand {
  const drifted = { ...strand };
  const amount = () => (chance(rng, zone.gen.widthDrift) ? (chance(rng, 0.5) ? -1 : 1) : 0);

  const lo = Math.min(Math.max(strand.lo + amount(), 0), MAP_WIDTH - 1);
  const hi = Math.min(Math.max(strand.hi + amount(), 0), MAP_WIDTH - 1);
  if (hi - lo + 1 >= MIN_STRAND) {
    // Keep the column the trail arrives on inside the strand. Without this
    // the trail gets clamped sideways and leaves a diagonal gap, which is
    // not a path: four-connected means the step has to share an edge.
    drifted.lo = Math.min(lo, strand.trail);
    drifted.hi = Math.max(hi, strand.trail);
  }

  // Terrain height wanders one layer at a time, within the zone's range.
  if (chance(rng, 0.3)) {
    const step = chance(rng, 0.5) ? -1 : 1;
    drifted.height = Math.min(Math.max(strand.height + step, zone.gen.minHeight), zone.gen.maxHeight);
  }

  if (chance(rng, 0.15)) drifted.ridge = !strand.ridge;
  drifted.peak = chance(rng, zone.gen.peakChance) ? zone.gen.peakHeight : 0;

  // The trail steps one column at a time and stays on its strand. The row
  // emits every column between where it entered and where it leaves, so a
  // sideways step is still a connected path rather than a diagonal hop.
  const step = chance(rng, 0.45) ? (chance(rng, 0.5) ? -1 : 1) : 0;
  const trail = Math.min(Math.max(strand.trail + step, drifted.lo), drifted.hi);
  drifted.trail = trail;
  drifted.spanLo = Math.min(strand.trail, trail);
  drifted.spanHi = Math.max(strand.trail, trail);
  return drifted;
}

/* Pull the height back towards the one the chunk must close on, never by
   more than a layer at a time. Applied to every row rather than inside
   `drift`, because a fork or a merge skips drift altogether — and those
   were precisely the rows that used to escape it and leave a chunk ending
   too high to step onto the next one. */
function settle(strand: Strand, seamHeight: number, rowsLeft: number): void {
  strand.height = Math.min(
    Math.max(strand.height, seamHeight - rowsLeft),
    seamHeight + rowsLeft,
  );
}

/** Can this strand be cut in two and leave two legal strands? */
const canFork = (strand: Strand) => width(strand) >= MIN_STRAND * 2 + MIN_GAP;

function fork(strand: Strand, rng: Rng): [Strand, Strand] {
  const spare = width(strand) - (MIN_STRAND * 2 + MIN_GAP);
  const leftExtra = spare > 0 ? nextInt(rng, spare + 1) : 0;
  const left: Strand = {
    ...strand,
    lo: strand.lo,
    hi: strand.lo + MIN_STRAND - 1 + leftExtra,
    ridge: false,
    peak: 0,
  };
  const right: Strand = {
    ...strand,
    lo: left.hi + MIN_GAP + 1,
    hi: strand.hi,
    ridge: strand.ridge,
  };
  // Each branch keeps a trail, pinned inside its own land.
  for (const branch of [left, right]) {
    branch.trail = Math.min(Math.max(strand.trail, branch.lo), branch.hi);
    branch.spanLo = branch.trail;
    branch.spanHi = branch.trail;
  }
  return [left, right];
}

function merge(left: Strand, right: Strand): Strand {
  // The merge row carries a trail wide enough to touch everything either
  // branch was using, so both reconnect however they had wandered.
  return {
    lo: Math.min(left.lo, right.lo),
    hi: Math.max(left.hi, right.hi),
    trail: left.trail,
    spanLo: Math.min(left.trail, right.trail, left.spanLo, right.spanLo),
    spanHi: Math.max(left.trail, right.trail, left.spanHi, right.spanHi),
    // Both banks are kept within a layer of each other while the fork is
    // open, so meeting at the higher of the two is still a single step up.
    height: Math.max(left.height, right.height),
    ridge: false,
    peak: 0,
  };
}

/** Turn a row's strands into stack strings. */
function paintRow(strands: Strand[], rng: Rng, zone: Zone): Stack[] {
  const cells: Stack[] = new Array(MAP_WIDTH).fill(VOID);

  for (const strand of strands) {
    // An edge column of a wide enough strand may be water or rock. Only the
    // outermost column is ever replaced, so what is left is still one
    // unbroken walkable run — a fork can never be created by accident.
    const decorable = width(strand) >= MIN_STRAND + 2;
    const special = new Map<number, 'W' | 'R'>();
    if (decorable) {
      for (const edge of [strand.lo, strand.hi]) {
        if (edge >= strand.spanLo && edge <= strand.spanHi) continue;   // never the trail
        if (chance(rng, zone.gen.waterChance)) special.set(edge, 'W');
        else if (chance(rng, zone.gen.rockChance)) special.set(edge, 'R');
      }
    }

    /* Terrain rises away from the trail one layer per column, never in a
       jump. A peak three layers up is therefore a flight of terraces rather
       than a spire, which is what stops a tile ending up more than a layer
       above every one of its neighbours — stranded, with no way on or off.
       Nothing is heaped on the trail itself, so the route stays a walk
       however dramatic the ground either side becomes. */
    const rise = (strand.ridge ? 1 : 0) + strand.peak;

    for (let col = strand.lo; col <= strand.hi; col += 1) {
      const beyond = col - strand.spanHi;
      const stepped = beyond > 0 ? Math.min(rise, beyond) : 0;
      const height = Math.max(1, strand.height + stepped);
      const decoration = special.get(col);

      if (decoration === 'W') cells[col] = 'G'.repeat(Math.max(0, height - 1)) + 'W';
      else if (decoration === 'R') cells[col] = 'G'.repeat(height) + 'R';
      else if (col >= strand.spanLo && col <= strand.spanHi) cells[col] = 'G'.repeat(height - 1) + 'D';
      else cells[col] = 'G'.repeat(height);
    }
  }

  return cells;
}

export interface Chunk {
  index: number;
  zone: Zone;
  /** CHUNK_ROWS rows of MAP_WIDTH cells. */
  rows: Stack[][];
}

/** Chunk `index` of the world grown from `seed`. Pure: same arguments in,
 *  same chunk out, no matter what else has been generated. */
export function generateChunk(seed: number, index: number): Chunk {
  const rng = createRng(hashSeed(seed, index));
  const zone = zoneForRow(index * CHUNK_ROWS);
  const startHeight = Math.min(Math.max(1, zone.gen.minHeight), zone.gen.maxHeight);

  const plan: Strand[][] = [[canonicalStrand(startHeight)]];

  for (let row = 1; row < CHUNK_ROWS - 1; row += 1) {
    const previous = plan[row - 1]!;
    // Rows left before the closing row, less one for the step onto it.
    const rowsLeft = Math.max(0, CHUNK_ROWS - 2 - row);
    let next: Strand[];

    if (previous.length === 2) {
      const [left, right] = previous as [Strand, Strand];
      if (chance(rng, zone.gen.mergeChance)) {
        next = [merge(left, right)];
      } else {
        // Drift both, then hold them apart so the gap survives.
        const a = drift(left, rng, zone);
        const b = drift(right, rng, zone);
        // Keep the two banks within a layer of each other, so whichever
        // height the merge settles on is a single step from both.
        b.height = Math.min(Math.max(b.height, a.height - 1), a.height + 1);

        // Both drifted freely, so they may have closed the gap. Pull one
        // back — but only as far as its own trail, because a branch that
        // loses the column its path arrives on is a broken path. If neither
        // can give way, the fork closes here instead.
        let sustainable = true;
        if (b.lo - a.hi - 1 < MIN_GAP) {
          const aHi = b.lo - MIN_GAP - 1;
          const bLo = a.hi + MIN_GAP + 1;
          if (aHi >= a.spanHi && aHi - a.lo + 1 >= MIN_STRAND) a.hi = aHi;
          else if (bLo <= b.spanLo && b.hi - bLo + 1 >= MIN_STRAND) b.lo = bLo;
          else sustainable = false;
        }

        if (sustainable) {
          next = [a, b];
        } else {
          /* Closing the fork here merges two strands that have already
             drifted, and taking the higher of those can be two layers above
             the lower BANK — a climb, not a step. Hold the merged height
             within a layer of both banks as they were. */
          const merged = merge(a, b);
          const banks = [left.height, right.height];
          merged.height = Math.min(
            Math.max(merged.height, Math.max(...banks) - 1),
            Math.min(...banks) + 1,
          );
          next = [merged];
        }
      }
    } else {
      const only = previous[0]!;
      if (canFork(only) && chance(rng, zone.gen.forkChance)) {
        const [left, right] = fork(only, rng);
        // Widen the trail on the row above so both branches hang off a
        // path that is already connected — this is the whole trick.
        only.spanLo = Math.min(only.spanLo, left.trail);
        only.spanHi = Math.max(only.spanHi, right.trail);
        next = [left, right];
      } else {
        next = [drift(only, rng, zone)];
      }
    }

    for (const strand of next) settle(strand, startHeight, rowsLeft);
    plan.push(next);
  }

  // Close on a canonical row, reaching back to whatever the last row left.
  const last = plan[plan.length - 1]!;
  const closing = canonicalStrand(startHeight);
  closing.spanLo = Math.min(SEAM_TRAIL[0], ...last.map((s) => s.trail));
  closing.spanHi = Math.max(SEAM_TRAIL[1], ...last.map((s) => s.trail));
  plan.push([closing]);

  return { index, zone, rows: plan.map((strands) => paintRow(strands, rng, zone)) };
}
