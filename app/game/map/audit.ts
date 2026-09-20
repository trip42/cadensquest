/* Map invariants.

   In the prototype this validated a map written by hand. Now the generator
   guarantees these properties by construction, so the audit's job is to be
   the test that proves it — run over thousands of seeds in CI rather than
   over one map at runtime. */

import { MIN_STRAND } from './generate';
import { surfaceKind, type Stack, VOID } from './tiles';

export interface MapAudit {
  rows: number;
  width: number;
  /** Connected pieces of walkable ground. One means the map is traversable. */
  groundPieces: number;
  /** Connected pieces of trail. One means the path forks and rejoins. */
  trailPieces: number;
  narrowestStrand: number;
  widestRow: number;
  forkedRows: number;
  ok: boolean;
}

type Match = (row: number, col: number) => boolean;

/** Flood fill over a window of rows. The window is open at top and bottom,
 *  so pass whole chunks: those begin and end on a full-width row. */
function countComponents(rows: Stack[][], width: number, matches: Match): number {
  const seen = new Set<number>();
  let found = 0;

  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const key = row * width + col;
      if (seen.has(key) || !matches(row, col)) continue;
      found += 1;
      const queue = [[row, col] as const];
      seen.add(key);
      while (queue.length) {
        const [r, c] = queue.pop()!;
        const neighbours = [[r + 1, c], [r - 1, c], [r, c - 1], [r, c + 1]] as const;
        for (const [nr, nc] of neighbours) {
          if (nr < 0 || nr >= rows.length || nc < 0 || nc >= width) continue;
          const nk = nr * width + nc;
          if (seen.has(nk) || !matches(nr, nc)) continue;
          seen.add(nk);
          queue.push([nr, nc]);
        }
      }
    }
  }

  return found;
}

export function auditRows(rows: Stack[][], width: number): MapAudit {
  const cell = (row: number, col: number): Stack => rows[row]?.[col] ?? VOID;
  const kind = (row: number, col: number) => surfaceKind(cell(row, col));
  const isGround: Match = (row, col) => {
    const k = kind(row, col);
    return k === 'ground' || k === 'trail';
  };
  const isTrail: Match = (row, col) => kind(row, col) === 'trail';

  let narrowest = Infinity;
  let widest = 0;
  let forkedRows = 0;

  for (let row = 0; row < rows.length; row += 1) {
    let filled = 0;
    let strands = 0;
    let smallest = Infinity;
    let run = 0;
    for (let col = 0; col <= width; col += 1) {
      const solid = col < width && cell(row, col) !== VOID;
      if (solid) {
        filled += 1;
        run += 1;
        continue;
      }
      if (run) {
        strands += 1;
        smallest = Math.min(smallest, run);
        run = 0;
      }
    }
    narrowest = Math.min(narrowest, smallest);
    widest = Math.max(widest, filled);
    if (strands > 1) forkedRows += 1;
  }

  const groundPieces = countComponents(rows, width, isGround);
  const trailPieces = countComponents(rows, width, isTrail);

  return {
    rows: rows.length,
    width,
    groundPieces,
    trailPieces,
    narrowestStrand: narrowest,
    widestRow: widest,
    forkedRows,
    ok: groundPieces === 1 && trailPieces === 1 && narrowest >= MIN_STRAND,
  };
}
