/* Isometric projection, in design space.

   The renderer works in design units and the canvas is scaled to fit
   whatever the screen is doing, so a tile is the same size relative to the
   screen everywhere. Only `resize` knows the screen exists.

   The camera's subject does not have to sit in the middle of the canvas.
   The map fills the window, but the hand of cards covers the bottom of it,
   so `focusY` pulls the action up into the clear part. */

export const TILE_W = 112;
export const TILE_H = 56;
export const LAYER_H = 17;
export const HW = TILE_W / 2;
export const HH = TILE_H / 2;

/* The area the game guarantees to show, in design units. The canvas is
   scaled so at least this much fits; a roomier window shows more rather
   than the same amount blown up. */
export const DESIGN_W = 1400;
export const DESIGN_H = 900;

/* How much closer the camera sits than simply framing the design area
   would put it. Raise it to zoom in, lower it to pull back. */
export const ZOOM = 1.5;

/* Past these the map stops rescaling: a phone would otherwise draw tiles
   too small to tap, a wall display too large to read. */
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2.2;

/** Where the camera's subject sits, as a fraction of the viewport. The map
 *  is full-screen and the cards cover the bottom of it, so the player rides
 *  about a third of the way down, clear of them.
 *
 *  This is where the CHARACTER lands, not the tile under him — `anchorY`
 *  below takes care of the difference. */
export const FOCUS_X = 0.5;
export const FOCUS_Y = 0.33;

export interface Camera {
  row: number;
  col: number;
  panX: number;
  panY: number;
  /** Fractions of the viewport the camera's subject is pinned to. */
  focusX: number;
  focusY: number;
  /* A sprite stands on its tile, so aiming the camera at the tile leaves
     the character floating well above the mark. This pushes the world down
     by half his height, which puts the man — not the ground he is on — at
     the focus point. Design units, so it holds at every zoom. */
  anchorY: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Screen position of the BASE of a cell, given where the camera is. */
export const projectX = (col: number, row: number, camera: Camera, view: Viewport): number =>
  (col - camera.col - (row - camera.row)) * HW + view.width * camera.focusX + camera.panX;

export const projectY = (col: number, row: number, camera: Camera, view: Viewport): number =>
  (col - camera.col + (row - camera.row)) * HH + view.height * camera.focusY + camera.panY + camera.anchorY;

/** Screen point back to a cell on the ground plane. Height is handled by the
 *  caller, which tests the stacks that could be standing in the way. */
export function unproject(px: number, py: number, camera: Camera, view: Viewport): { row: number; col: number } {
  const a = (px - view.width * camera.focusX - camera.panX) / HW;
  const b = (py - view.height * camera.focusY - camera.panY - camera.anchorY) / HH;
  return {
    row: camera.row + (b - a) / 2,
    col: camera.col + (a + b) / 2,
  };
}

export function diamondPath(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  ctx.beginPath();
  ctx.moveTo(sx, sy - HH);
  ctx.lineTo(sx + HW, sy);
  ctx.lineTo(sx, sy + HH);
  ctx.lineTo(sx - HW, sy);
  ctx.closePath();
}

/** Deterministic per-tile noise, so surface detail never crawls as the
 *  camera moves. */
export function hash(row: number, col: number, salt: number): number {
  let h = Math.imul(row + 1013, 374761393) ^ Math.imul(col + 619, 668265263) ^ Math.imul(salt + 7, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
