/* Drawing a marked tile, from its aura type's look.

   One function for the map and the editor's preview alike, so what the
   Auras tab shows is what a run draws. A mark reads as something sitting
   on the ground rather than a tint of it:

     - a faint stain of its shape on the tile, the shadow of —
     - a plate of that shape floating `height` above the tile, bobbing
       (`bounceSpeed`, `bounceHeight`) and turning flat on the ground
       (`spin`), with highlights drifting over it the way the water's do
       and a rim (`border`, `borderColour`) —
     - a glow joining the plate to the ground, brightest at the foot —
     - motes rising off it (`particles` of them, `particleHeight` high),
       fading as they climb.

   Shapes lie on the ground at the tile's own 2:1 proportions: at size 1 a
   circle passes through the tile's corners. Mote positions come from
   `hash`, so each tile's are its own and never crawl as the camera moves;
   time only drives the motion. */

import { DEFAULT_LOOK, type MarkLook, type MarkShape } from '../game/auras';
import { hash, HH, HW } from './iso';

const TAU = Math.PI * 2;

/** A #rrggbb colour as rgba, at this opacity. */
export function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${alpha})`;
}

/* Each shape as points on the unit circle's plane, before the turn and
   the projection: x across, y away from the viewer. */
const ring = (points: number, radius: (i: number) => number, start = -Math.PI / 2) =>
  Array.from({ length: points }, (_, i) => {
    const angle = start + (i / points) * TAU;
    return [Math.cos(angle) * radius(i), Math.sin(angle) * radius(i)] as const;
  });
const ARM = 0.34;
const OUTLINES: Partial<Record<MarkShape, ReadonlyArray<readonly [number, number]>>> = {
  square: [[-0.72, -0.72], [0.72, -0.72], [0.72, 0.72], [-0.72, 0.72]],
  diamond: [[0, -1], [1, 0], [0, 1], [-1, 0]],
  triangle: ring(3, () => 1),
  hexagon: ring(6, () => 1, 0),
  star: ring(10, (i) => (i % 2 ? 0.45 : 1)),
  cross: [
    [-ARM, -1], [ARM, -1], [ARM, -ARM], [1, -ARM], [1, ARM], [ARM, ARM],
    [ARM, 1], [-ARM, 1], [-ARM, ARM], [-1, ARM], [-1, -ARM], [-ARM, -ARM],
  ],
};

/** Trace a shape lying flat at (x, y), `scale` of a tile wide, turned
 *  `angle` radians on the ground. Fill it with "evenodd": a ring is two
 *  circles. */
export function shapePath(ctx: CanvasRenderingContext2D, shape: MarkShape, x: number, y: number, scale: number, angle = 0): void {
  const rx = HW * scale;
  const ry = HH * scale;
  ctx.beginPath();
  if (shape === 'circle' || shape === 'ring') {
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    if (shape === 'ring') {
      ctx.moveTo(x + rx * 0.55, y);
      ctx.ellipse(x, y, rx * 0.55, ry * 0.55, 0, 0, TAU, true);
    }
    return;
  }
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  OUTLINES[shape]!.forEach(([u, v], i) => {
    const px = x + (u * cos - v * sin) * rx;
    const py = y + (u * sin + v * cos) * ry;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  });
  ctx.closePath();
}

export interface MarkPlace {
  /** Where the tile's top face is centred. */
  x: number;
  y: number;
  /** The tile, for the mote positions and to set tiles' bobs apart. */
  row: number;
  col: number;
}

/** A mark drawn in full, from its look. `t` is seconds. */
export function drawMark(ctx: CanvasRenderingContext2D, look: MarkLook, at: MarkPlace, t: number, ink: string): void {
  const { x, y: ty, row, col } = at;
  const { colour, shape, size } = look;
  const phase = (row + col) * 0.9;
  const angle = t * look.spin * TAU;

  // The stain: its shape, faintly, on the tile itself.
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = colour;
  shapePath(ctx, shape, x, ty, Math.min(1, size * 1.13), angle);
  ctx.fill('evenodd');
  ctx.restore();

  // The plate, raised and bobbing.
  const lift = look.height + Math.sin(t * look.bounceSpeed + phase) * look.bounceHeight;
  const py = ty - lift;
  const rx = HW * size;
  const ry = HH * size;

  // The glow under it: the front of a short column from the ground up to
  // the plate, brightest at the foot and fading upward.
  if (lift > 0) {
    const glow = ctx.createLinearGradient(0, ty + ry, 0, py);
    glow.addColorStop(0, withAlpha(colour, 0.5));
    glow.addColorStop(1, withAlpha(colour, 0.08));
    ctx.save();
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(x - rx, py);
    ctx.lineTo(x - rx, ty);
    ctx.ellipse(x, ty, rx, ry, 0, Math.PI, 0, true);     // front of the foot
    ctx.lineTo(x + rx, py);
    ctx.ellipse(x, py, rx, ry, 0, 0, Math.PI, false);    // front of the plate
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = 0.62;
  ctx.fillStyle = colour;
  shapePath(ctx, shape, x, py, size, angle);
  ctx.fill('evenodd');
  ctx.restore();

  // Highlights drifting across it, as on the water.
  ctx.save();
  shapePath(ctx, shape, x, py, size, angle);
  ctx.clip('evenodd');
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 2; i += 1) {
    const hy = py + Math.sin(t * 1.4 + phase + i * 2.4) * HH * 0.3 + (i - 0.5) * 6;
    ctx.moveTo(x - HW * 0.28, hy);
    ctx.lineTo(x + HW * 0.28, hy);
  }
  ctx.stroke();
  ctx.restore();

  // Its rim, with a darker lip under it for thickness.
  if (look.border > 0) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = ink;
    ctx.lineWidth = look.border + 0.5;
    shapePath(ctx, shape, x, py + 2, size, angle);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = look.borderColour ?? colour;
    ctx.lineWidth = look.border;
    shapePath(ctx, shape, x, py, size, angle);
    ctx.stroke();
    ctx.restore();
  }

  // Motes rising off it, fading as they climb.
  ctx.save();
  ctx.fillStyle = look.particleColour ?? colour;
  for (let i = 0; i < look.particles; i += 1) {
    const a = hash(row, col, i + 300) * 2 - 1;
    const b = hash(row, col, i + 340) * 2 - 1;
    const speed = 0.35 + hash(row, col, i + 380) * 0.3;
    const age = (t * speed + hash(row, col, i + 420)) % 1;
    ctx.globalAlpha = 0.85 * (1 - age);
    const mx = x + (a - b) * HW * 0.45 * size;
    const my = py + (a + b) * HH * 0.45 * size - age * look.particleHeight;
    ctx.fillRect(Math.round(mx) - 2, Math.round(my) - 2, 4, 4);
  }
  ctx.restore();
}

/** At most this many other marks show as badges; past it, a count. */
export const MAX_BADGES = 4;

/* The other marks on a tile, under the newest: each a small copy of its
   own shape in its own colour, standing on the ground round the edge of
   the stain and slowly circling it. */
export function drawBadges(ctx: CanvasRenderingContext2D, looks: readonly MarkLook[], at: MarkPlace, t: number, ink: string): void {
  const shown = looks.slice(-MAX_BADGES);
  shown.forEach((look, i) => {
    // Spread round the front of the tile, where they are not behind the
    // plate's glow.
    const angle = Math.PI * (0.15 + (0.7 * (i + 0.5)) / shown.length) + Math.sin(t * 0.6) * 0.12;
    const bx = at.x + Math.cos(angle) * HW * 0.5;
    const by = at.y + Math.sin(angle) * HH * 0.5 - 3 - Math.abs(Math.sin(t * 2 + i)) * 1.5;
    ctx.save();
    ctx.fillStyle = look.colour;
    shapePath(ctx, look.shape, bx, by, 0.16, t * look.spin * TAU);
    ctx.fill('evenodd');
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  });
}

/** How a mark with no type (a portal) looks: today's plate, its colour. */
export const plainLook = (colour: string): MarkLook => ({ ...DEFAULT_LOOK, colour });
