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
  /** Tallest stack seen, so peaks can be told apart from flat ground. */
  tallestStack: number;
  /** Can you walk from the first row to the last without a climb? */
  traversable: boolean;
  /** Walkable tiles with no neighbour within a layer — stranded spires. */
  stranded: number;
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

/* Connectivity is not enough on its own: ground can be neighbouring and
   still unwalkable, because a step of more than `maxStep` layers is a climb.
   This walks the map the way a character would and reports whether the far
   end can be reached at all — which is what stops a wall of sheer drops
   sealing the map off. */
export function traversable(rows: Stack[][], width: number, maxStep = 1): boolean {
  if (!rows.length) return false;

  const walkable = (row: number, col: number): boolean => {
    const stack = rows[row]?.[col];
    if (!stack) return false;
    const kind = surfaceKind(stack);
    return kind === 'ground' || kind === 'trail';
  };
  const height = (row: number, col: number): number => (rows[row]?.[col] ?? '').length;

  const seen = new Set<number>();
  const queue: Array<[number, number]> = [];
  for (let col = 0; col < width; col += 1) {
    if (!walkable(0, col)) continue;
    seen.add(col);
    queue.push([0, col]);
  }

  const last = rows.length - 1;
  while (queue.length) {
    const [row, col] = queue.pop()!;
    if (row === last) return true;

    for (const [nr, nc] of [[row + 1, col], [row - 1, col], [row, col - 1], [row, col + 1]] as const) {
      if (nr < 0 || nr >= rows.length || nc < 0 || nc >= width) continue;
      const key = nr * width + nc;
      if (seen.has(key) || !walkable(nr, nc)) continue;
      if (Math.abs(height(nr, nc) - height(row, col)) > maxStep) continue;
      seen.add(key);
      queue.push([nr, nc]);
    }
  }

  return false;
}

/* Every walkable tile should have somewhere to step: at least one
   neighbouring tile within a layer of it, up or down. A tile that sits more
   than a layer above all four of its neighbours is a spire you can neither
   climb nor leave, and one that sits below them all is a pit. Counts them. */
export function strandedTiles(rows: Stack[][], width: number, maxStep = 1): number {
  const walkable = (row: number, col: number): boolean => {
    const stack = rows[row]?.[col];
    if (!stack) return false;
    const kind = surfaceKind(stack);
    return kind === 'ground' || kind === 'trail';
  };
  const height = (row: number, col: number): number => (rows[row]?.[col] ?? '').length;

  let stranded = 0;
  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!walkable(row, col)) continue;
      const mine = height(row, col);
      const reachable = ([[row + 1, col], [row - 1, col], [row, col - 1], [row, col + 1]] as const)
        .some(([nr, nc]) => walkable(nr, nc) && Math.abs(height(nr, nc) - mine) <= maxStep);
      if (!reachable) stranded += 1;
    }
  }
  return stranded;
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

  let tallest = 0;
  for (const row of rows) for (const stack of row) tallest = Math.max(tallest, stack.length);

  const groundPieces = countComponents(rows, width, isGround);
  const trailPieces = countComponents(rows, width, isTrail);
  const canCross = traversable(rows, width);
  const stranded = strandedTiles(rows, width);

  return {
    rows: rows.length,
    width,
    groundPieces,
    trailPieces,
    narrowestStrand: narrowest,
    widestRow: widest,
    forkedRows,
    tallestStack: tallest,
    traversable: canCross,
    stranded,
    ok: groundPieces === 1 && trailPieces === 1 && narrowest >= MIN_STRAND
      && canCross && stranded === 0,
  };
}
