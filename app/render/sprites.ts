/* Sprite sheets.

   Characters are flat pictures standing upright in the middle of a tile.
   Two kinds of source feed the same draw path:

     - a cell of a real sprite sheet, named by a key the game layer knows
       nothing about, so `game/` never mentions an asset URL
     - the procedural placeholder, still used where there is no art

   Sheets load asynchronously. `frameFor` returns null until the image is
   in, and the renderer draws the shadow alone in the meantime, so a slow
   load never throws and never stalls a frame. */

import cadenSheet from '~/assets/spritesheets/caden.png';
import enemiesGrid from '~/assets/spritesheets/enemies-grid.png';
import type { AnimationClip, AnimationSet, SpriteStyle } from '../game/entities/types';

/* Where each sheet lives, and the grid it is cut into. Cell size is derived
   from the image rather than written down: exports do not always land on
   exact multiples, and 1277 across 8 columns should still be 8 columns. */
export const SHEET_FILES: Record<string, { src: string; columns: number; rows: number }> = {
  enemies: { src: enemiesGrid, columns: 3, rows: 6 },
  caden: { src: cadenSheet, columns: 8, rows: 4 },
};

export interface SourceFrame {
  image: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Where the artwork starts and ends inside the source rect, as
   *  fractions of its height. Lets the renderer stand a character on its
   *  feet and hang its health bar above its head, whatever padding the
   *  sheet leaves around the frames. */
  top: number;
  bottom: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LoadedSheet {
  image: HTMLImageElement;
  cellW: number;
  cellH: number;
  /** Bounds of the art inside a block of cells, worked out on demand. */
  bounds: Map<string, Rect>;
}

const loaded = new Map<string, LoadedSheet>();
const failed = new Set<string>();

/** Fetch a sheet, once. Returns null while it is still on the way. */
function sheet(key: string): LoadedSheet | null {
  const ready = loaded.get(key);
  if (ready) return ready;
  if (failed.has(key)) return null;

  const file = SHEET_FILES[key];
  if (!file) {
    failed.add(key);
    console.warn(`[sprites] no sheet registered as "${key}"`);
    return null;
  }
  if (pendingLoads.has(key)) return null;

  pendingLoads.add(key);
  const image = new Image();
  image.onload = () => {
    pendingLoads.delete(key);
    loaded.set(key, {
      image,
      cellW: image.width / file.columns,
      cellH: image.height / file.rows,
      bounds: new Map(),
    });
  };
  image.onerror = () => {
    pendingLoads.delete(key);
    failed.add(key);
    console.warn(`[sprites] could not load ${file.src}`);
  };
  image.src = file.src;
  return null;
}

const pendingLoads = new Set<string>();

/* Where the art actually sits inside its cell.

   Measuring beats trusting the padding: a footprint then describes the
   creature rather than its margins, and a re-export with different bleed
   needs no numbers changed.

   For an animated block every frame is composited into one scratch cell
   first, so the answer covers the whole cycle. Measuring frames separately
   would make a character breathe in and out as its own bounding box
   changed underneath it. */
function blockBounds(
  loadedSheet: LoadedSheet,
  col: number,
  row: number,
  columns: number,
  rows: number,
): Rect {
  const key = `${col}:${row}:${columns}x${rows}`;
  const cached = loadedSheet.bounds.get(key);
  if (cached) return cached;

  const { cellW, cellH, image } = loadedSheet;
  const w = Math.ceil(cellW);
  const h = Math.ceil(cellH);
  const full: Rect = { x: 0, y: 0, w: cellW, h: cellH };

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return full;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      ctx.drawImage(image, (col + c) * cellW, (row + r) * cellH, cellW, cellH, 0, 0, cellW, cellH);
    }
  }

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return full;   // a tainted canvas: fall back to the whole cell
  }

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3]! <= 8) continue;   // ignore near-transparent edges
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const bounds: Rect = maxX < 0
    ? full
    : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  loadedSheet.bounds.set(key, bounds);
  return bounds;
}

/* ------------------------------ placeholder ---------------------------- */

const BUILDS: Record<'humanoid' | 'beast' | 'hulk', { w: number; h: number; girth: number; stoop: number }> = {
  humanoid: { w: 44, h: 62, girth: 0.52, stoop: 0 },
  beast: { w: 52, h: 44, girth: 0.72, stoop: 0.35 },
  hulk: { w: 58, h: 74, girth: 0.78, stoop: 0.1 },
};

interface PlaceholderSheet {
  image: HTMLCanvasElement;
  frameW: number;
  frameH: number;
}

const placeholders = new WeakMap<SpriteStyle, PlaceholderSheet>();

/** Placeholder art: enough shape and motion to read as a character. */
export function buildPlaceholderSheet(
  style: Extract<SpriteStyle, { kind: 'placeholder' }>,
  animations: AnimationSet,
): PlaceholderSheet {
  const build = BUILDS[style.build];
  const frameW = build.w + 8;
  const frameH = build.h + 8;
  const clips = Object.values(animations);
  const columns = Math.max(...clips.map((clip) => clip.frames));
  const rows = Math.max(...clips.map((clip) => clip.sheetRow)) + 1;

  const canvas = document.createElement('canvas');
  canvas.width = frameW * columns;
  canvas.height = frameH * rows;
  const ctx = canvas.getContext('2d')!;

  for (const [state, clip] of Object.entries(animations)) {
    for (let frame = 0; frame < clip.frames; frame += 1) {
      ctx.save();
      ctx.translate(frame * frameW + frameW / 2, clip.sheetRow * frameH + frameH);
      drawFigure(ctx, style, build, state as keyof AnimationSet, frame, clip.frames);
      ctx.restore();
    }
  }

  return { image: canvas, frameW, frameH };
}

/* ------------------------------ the one entry point -------------------- */

/** The rectangle of pixels to draw for this character right now, or null if
 *  its artwork has not arrived yet. */
export function frameFor(
  style: SpriteStyle,
  animations: AnimationSet,
  clip: AnimationClip,
  frame: number,
): SourceFrame | null {
  if (style.kind === 'sheet') {
    const source = sheet(style.sheet);
    if (!source) return null;

    const clips = Object.values(animations);
    const columns = Math.max(...clips.map((item) => item.frames));
    const rows = Math.max(...clips.map((item) => item.sheetRow)) + 1;
    const bounds = blockBounds(source, style.col, style.row, columns, rows);

    // A cycle is drawn cell by cell, never trimmed: the artist aligned the
    // frames against each other, and cropping each one to its own content
    // would throw that registration away. A single still has no cycle to
    // stay registered with, so it is cropped to what is actually drawn.
    const animated = columns > 1 || rows > 1;
    const cell = {
      col: style.col + Math.min(frame, clip.frames - 1),
      row: style.row + clip.sheetRow,
    };

    if (!animated) {
      return {
        image: source.image,
        sx: cell.col * source.cellW + bounds.x,
        sy: cell.row * source.cellH + bounds.y,
        sw: bounds.w,
        sh: bounds.h,
        top: 0,
        bottom: 1,
      };
    }

    return {
      image: source.image,
      sx: cell.col * source.cellW,
      sy: cell.row * source.cellH,
      sw: source.cellW,
      sh: source.cellH,
      top: bounds.y / source.cellH,
      bottom: (bounds.y + bounds.h) / source.cellH,
    };
  }

  let built = placeholders.get(style);
  if (!built) {
    built = buildPlaceholderSheet(style, animations);
    placeholders.set(style, built);
  }
  const column = Math.min(frame, clip.frames - 1);
  return {
    image: built.image,
    sx: column * built.frameW,
    sy: clip.sheetRow * built.frameH,
    sw: built.frameW,
    sh: built.frameH,
    top: 0,
    bottom: 1,
  };
}

/* ------------------------------ figure drawing ------------------------- */

/** Origin is the middle of the character's feet, y growing upward. */
function drawFigure(
  ctx: CanvasRenderingContext2D,
  style: Extract<SpriteStyle, { kind: 'placeholder' }>,
  build: { w: number; h: number; girth: number; stoop: number },
  state: keyof AnimationSet,
  frame: number,
  frames: number,
): void {
  const phase = frames > 1 ? frame / (frames - 1) : 0;
  const cycle = Math.sin((frame / frames) * Math.PI * 2);

  let lean = 0;
  let sink = 0;
  let bob = 0;
  let alpha = 1;

  switch (state) {
    case 'idle':
      bob = cycle * 1.2;
      break;
    case 'walk':
      bob = Math.abs(cycle) * 3;
      lean = cycle * 0.06;
      break;
    case 'attack':
    case 'ranged':
      lean = Math.sin(phase * Math.PI) * 0.32;
      break;
    case 'hurt':
      lean = -0.22;
      sink = 3;
      break;
    case 'die':
      lean = -0.1 - phase * 1.2;
      sink = phase * build.h * 0.5;
      alpha = 1 - phase * 0.65;
      break;
  }

  ctx.globalAlpha = alpha;
  ctx.translate(0, -sink + bob * 0.2);
  ctx.rotate(lean + build.stoop * 0.3);

  const bodyH = build.h * 0.58;
  const bodyW = build.w * build.girth;
  const legH = build.h * 0.28;
  const headR = build.w * 0.19;

  ctx.fillStyle = style.trim;
  const stride = state === 'walk' ? cycle * build.w * 0.16 : 0;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * bodyW * 0.22 + (side > 0 ? stride : -stride), 0);
    ctx.fillRect(-build.w * 0.09, -legH, build.w * 0.18, legH);
    ctx.restore();
  }

  ctx.fillStyle = style.body;
  roundedRect(ctx, -bodyW / 2, -legH - bodyH, bodyW, bodyH, build.w * 0.14);
  ctx.fill();

  ctx.fillStyle = style.trim;
  ctx.fillRect(-bodyW / 2, -legH - bodyH * 0.72, bodyW, bodyH * 0.14);

  ctx.fillStyle = style.body;
  ctx.beginPath();
  ctx.arc(0, -legH - bodyH - headR * 0.75, headR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = style.accent;
  ctx.fillRect(-headR * 0.45, -legH - bodyH - headR * 0.95, headR * 0.9, headR * 0.3);

  if (state === 'attack' || state === 'ranged') {
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bodyW * 0.45, -legH - bodyH * 0.6, build.w * 0.42, -0.9 + phase * 1.8, 0.5 + phase * 1.8);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
