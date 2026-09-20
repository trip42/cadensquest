/* Walking the map: what a character can reach, and how it gets there.

   Four-connected, because that is the connectivity the generator
   guarantees. A step of more than MAX_STEP layers is a climb, not a walk,
   so terraces shape routes rather than just decorating them. */

import type { World } from './world';

export interface Cell {
  row: number;
  col: number;
}

export interface MoveOptions {
  /** Give up past this many steps. Always bounded: the map is endless. */
  maxCost?: number;
  /** Extra blockers — other characters, hazards. */
  blocked?: (row: number, col: number) => boolean;
  /** Biggest height change a character can take in one step, in layers. */
  maxStep?: number;
}

const key = (row: number, col: number) => `${row}:${col}`;
export const sameCell = (a: Cell, b: Cell) => a.row === b.row && a.col === b.col;
export const cellDistance = (a: Cell, b: Cell) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);

function canEnter(world: World, from: Cell, row: number, col: number, options: MoveOptions): boolean {
  if (!world.walkable(row, col)) return false;
  if (options.blocked?.(row, col)) return false;
  const step = Math.abs(world.heightAt(row, col) - world.heightAt(from.row, from.col));
  return step <= (options.maxStep ?? 1);
}

const neighbours = (cell: Cell): Cell[] => [
  { row: cell.row + 1, col: cell.col },
  { row: cell.row - 1, col: cell.col },
  { row: cell.row, col: cell.col - 1 },
  { row: cell.row, col: cell.col + 1 },
];

/** Every cell within `budget` steps, with the cost of getting there.
 *  This is what the player phase highlights as movement range. */
export function reachable(
  world: World,
  from: Cell,
  budget: number,
  options: MoveOptions = {},
): Map<string, { cell: Cell; cost: number }> {
  const found = new Map<string, { cell: Cell; cost: number }>();
  if (budget <= 0) return found;

  const queue: Array<{ cell: Cell; cost: number }> = [{ cell: from, cost: 0 }];
  const seen = new Set<string>([key(from.row, from.col)]);

  while (queue.length) {
    const current = queue.shift()!;
    if (current.cost >= budget) continue;
    for (const next of neighbours(current.cell)) {
      const k = key(next.row, next.col);
      if (seen.has(k)) continue;
      if (!canEnter(world, current.cell, next.row, next.col, options)) continue;
      seen.add(k);
      const entry = { cell: next, cost: current.cost + 1 };
      found.set(k, entry);
      queue.push(entry);
    }
  }

  return found;
}

/** A* from `from` to `to`, returning the steps to walk — `from` excluded,
 *  `to` included — or null if it cannot be reached within the budget. */
export function findPath(world: World, from: Cell, to: Cell, options: MoveOptions = {}): Cell[] | null {
  if (sameCell(from, to)) return [];
  const maxCost = options.maxCost ?? 64;
  if (cellDistance(from, to) > maxCost) return null;
  if (!world.walkable(to.row, to.col)) return null;
  if (options.blocked?.(to.row, to.col)) return null;

  const start = key(from.row, from.col);
  const cameFrom = new Map<string, Cell>();
  const cost = new Map<string, number>([[start, 0]]);
  // Small maps and short budgets: a sorted array beats a heap's overhead.
  const open: Array<{ cell: Cell; priority: number }> = [{ cell: from, priority: 0 }];

  while (open.length) {
    open.sort((a, b) => a.priority - b.priority);
    const { cell } = open.shift()!;
    if (sameCell(cell, to)) break;

    const spent = cost.get(key(cell.row, cell.col))!;
    if (spent >= maxCost) continue;

    for (const next of neighbours(cell)) {
      if (!canEnter(world, cell, next.row, next.col, options)) continue;
      const k = key(next.row, next.col);
      const candidate = spent + 1;
      if (cost.has(k) && candidate >= cost.get(k)!) continue;
      cost.set(k, candidate);
      cameFrom.set(k, cell);
      open.push({ cell: next, priority: candidate + cellDistance(next, to) });
    }
  }

  const goal = key(to.row, to.col);
  if (!cameFrom.has(goal)) return null;

  const path: Cell[] = [];
  let cursor: Cell = to;
  while (!sameCell(cursor, from)) {
    path.unshift(cursor);
    cursor = cameFrom.get(key(cursor.row, cursor.col))!;
  }
  return path;
}
