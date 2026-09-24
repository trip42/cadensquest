/* The map renderer.

   Imperative and framework-free: it owns a canvas, a requestAnimationFrame
   loop and nothing else. Vue never reaches inside this, and this never
   reaches into Vue — it reads game state once per frame and draws it.

   Draw order is a painter's algorithm over diagonals of constant row + col,
   which is the true far-to-near order in this projection. Characters are
   folded into the same order by their interpolated depth, so someone
   standing behind a tall outcrop is correctly hidden by it. */

import { tick } from '../game/actions';
import { entityDef } from '../game/entities/definitions';
import type { Entity } from '../game/entities/types';
import { gemDef } from '../game/gems';
import type { Cell } from '../game/map/navigation';
import { type Reward, rewardLabel } from '../game/rewards';
import { KIND_OF, type FacePalette, MAX_STACK_HEIGHT, type TileKind, type TileLetter, VOID } from '../game/map/tiles';
import type { Game, TerrainLayer } from '../game/state';
import {
  type Camera,
  DESIGN_H,
  DESIGN_W,
  FOCUS_X,
  FOCUS_Y,
  HAND_CLEARANCE,
  MAX_SCALE,
  MIN_SCALE,
  ZOOM,
  diamondPath,
  hash,
  HH,
  HW,
  LAYER_H,
  projectX,
  projectY,
  TILE_H,
  TILE_W,
  unproject,
  type Viewport,
} from './iso';
import { frameFor } from './sprites';

export type HighlightKind = 'move' | 'target' | 'path' | 'hover';

interface HighlightStyle {
  fill: string;
  stroke?: string;
  /** Neon needs the glow as much as the line. */
  glow?: number;
}

const HIGHLIGHT: Record<HighlightKind, HighlightStyle> = {
  move: { fill: 'rgba(57, 255, 20, 0.1)', stroke: '#39ff14', glow: 9 },
  target: { fill: 'rgba(224, 122, 95, 0.3)', stroke: '#ff7a58', glow: 6 },
  path: { fill: 'rgba(240, 232, 170, 0.4)' },
  hover: { fill: 'rgba(255, 255, 255, 0.18)' },
};

export const cellKey = (row: number, col: number): string => `${row}:${col}`;

export interface RendererHooks {
  /** Called once per frame before drawing, with seconds elapsed. */
  onFrame?: (dt: number) => void;
}

/* The HUD's colours and faces, read from the CSS custom properties in
   main.css so the chips drawn on the canvas match the panels drawn over it.
   Read once, when the renderer starts; the fallbacks are the same values,
   for a canvas made before the stylesheet has landed. */
interface HudPalette {
  ink: string; panel: string; text: string; muted: string;
  red: string; yellow: string; green: string; blue: string; cyan: string;
  font: string;
}

function readPalette(): HudPalette {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    ink: read('--px-ink', '#0b0b17'),
    panel: read('--px-panel', '#262b44'),
    text: read('--px-text', '#f4f4f4'),
    muted: read('--px-muted', '#8b9bb4'),
    red: read('--px-red', '#e43b44'),
    yellow: read('--px-yellow', '#feae34'),
    green: read('--px-green', '#63c74d'),
    blue: read('--px-blue', '#0099db'),
    cyan: read('--px-cyan', '#2ce8f5'),
    font: read('--px-font', "'Silkscreen', monospace"),
  };
}

export class MapRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly game: Game;
  private readonly hooks: RendererHooks;

  private view: Viewport = { width: DESIGN_W, height: DESIGN_H };
  private camera: Camera = {
    row: 0, col: 0, panX: 0, panY: 0, focusX: FOCUS_X, focusY: FOCUS_Y, anchorY: 0,
  };
  /* Set once the player walks: the view slides back onto him, undoing
     whatever the last drag was looking at. */
  private recentring = false;
  private scale = 1;
  private raf = 0;
  private last = 0;
  private observer: ResizeObserver | null = null;

  private highlights = new Map<string, HighlightKind>();
  /* The area an area card would cover where it is aimed, and the friends
     it would catch — drawn so friendly fire is seen before it happens. */
  private aim: { cells: Set<string>; friends: Set<string> } | null = null;
  /* When each burst was first drawn, so each flashes once and fades. Keyed
     by the burst's id; the game keeps the recent ones, the renderer only
     reads them. */
  private burstStarts = new Map<string, number>();
  private hover: Cell | null = null;
  /* Health and intent belong on top of the scene, not inside it: drawn in
     the depth pass they get painted over by whoever stands in front. */
  private overlay: Array<{ sx: number; top: number; entity: Entity }> = [];
  private readonly palette: HudPalette = readPalette();

  constructor(canvas: HTMLCanvasElement, game: Game, hooks: RendererHooks = {}) {
    this.canvas = canvas;
    this.game = game;
    this.hooks = hooks;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    for (const burst of game.state.bursts) this.burstStarts.set(burst.id, -Infinity);

    const self = game.state.entities.find((entity) => entity.id === game.state.playerId)!;
    this.camera.row = self.row;
    this.camera.col = self.col;
    // Half his height, less the nudge that already sits him on the tile.
    const sprite = entityDef(self.defId).sprite;
    this.camera.anchorY = sprite.footprint.height / 2 - (sprite.offsetY ?? 0);

    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
    }
  }

  /* ------------------------------ lifecycle ---------------------------- */

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const frame = (now: number): void => {
      const dt = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      this.hooks.onFrame?.(dt);
      this.update(dt);
      this.draw(now);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.observer?.disconnect();
    this.observer = null;
  }

  /** Size the backing store to the element, then bake the design-to-screen
   *  scale into the transform so every drawing routine stays in design
   *  units and none of them has to know the screen size.
   *
   *  The map is full-bleed now, so its shape follows the window rather than
   *  a fixed ratio. Scaling to contain the design area keeps a tile the
   *  same size relative to the screen and guarantees at least that much map
   *  is visible; a window with room to spare shows more of the world rather
   *  than the same slice enlarged. */
  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);

    const contain = Math.min(rect.width / DESIGN_W, rect.height / DESIGN_H) * ZOOM;
    this.scale = Math.min(Math.max(contain, MIN_SCALE), MAX_SCALE);
    this.ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);

    this.view = { width: rect.width / this.scale, height: rect.height / this.scale };
    this.clampPan();
  }

  /* ------------------------------ input -------------------------------- */

  setHighlights(highlights: Map<string, HighlightKind>): void {
    this.highlights = highlights;
  }

  setHover(cell: Cell | null): void {
    this.hover = cell;
  }

  /** What an area card being aimed would cover: its tiles, and the ids of
   *  the player's own creatures it would catch. Null when not aiming one. */
  setAim(aim: { cells: Cell[]; friends: string[] } | null): void {
    this.aim = aim && aim.cells.length
      ? { cells: new Set(aim.cells.map((cell) => `${cell.row},${cell.col}`)), friends: new Set(aim.friends) }
      : null;
  }

  pan(dx: number, dy: number): void {
    // A deliberate drag wins until he moves again.
    this.recentring = false;
    this.camera.panX += dx / this.scale;
    this.camera.panY += dy / this.scale;
    this.clampPan();
  }

  /* Looking around is allowed; losing him is not. The pan is held to
     whatever keeps Caden inside a margin of the canvas — and above the
     cards, since being hidden behind the hand is no more use than being
     off the edge. Re-applied every frame, because the camera drifts and
     the viewport can resize under a pan that was legal when it was made. */
  private clampPan(): void {
    const { state } = this.game;
    const self = state.entities.find((entity) => entity.id === state.playerId);
    if (!self || !this.view.width || !this.view.height) return;

    const pos = visualCell(self);
    // Where he would be drawn with no pan applied.
    const naked: Camera = { ...this.camera, panX: 0, panY: 0 };
    const baseX = projectX(pos.col, pos.row, naked, this.view);
    const baseY = projectY(pos.col, pos.row, naked, this.view) - this.surfaceOffset(pos);

    /* Bound his whole figure, not the tile under his feet: `baseY` is where
       he stands, and he is drawn upward from there, so bounding the point
       alone would let his head slide off the top. */
    const sprite = entityDef(self.defId).sprite;
    const halfWide = sprite.footprint.width / 2;
    const tall = sprite.footprint.height;

    const inset = 40;
    const limit = (value: number, min: number, max: number): number =>
      min > max ? (min + max) / 2 : Math.min(Math.max(value, min), max);

    this.camera.panX = limit(
      this.camera.panX,
      inset + halfWide - baseX,
      this.view.width - inset - halfWide - baseX,
    );
    this.camera.panY = limit(
      this.camera.panY,
      inset + tall - baseY,
      this.view.height * HAND_CLEARANCE - baseY,
    );
  }

  recentre(): void {
    this.camera.panX = 0;
    this.camera.panY = 0;
    this.recentring = false;
  }

  /** Screen point to a cell, respecting height: a tall stack covers the
   *  ground behind it, so test top faces and keep the nearest hit. */
  pick(clientX: number, clientY: number): Cell | null {
    const rect = this.canvas.getBoundingClientRect();
    const px = (clientX - rect.left) / this.scale;
    const py = (clientY - rect.top) / this.scale;
    const flat = unproject(px, py, this.camera, this.view);

    let best: Cell | null = null;
    const span = 6;
    for (let row = Math.round(flat.row) - span; row <= Math.round(flat.row) + span; row += 1) {
      for (let col = 0; col < this.game.world.width; col += 1) {
        const stack = this.game.world.stackAt(row, col);
        if (stack === VOID) continue;
        const palette = this.paletteFor(row, stack[stack.length - 1] as TileLetter);
        const sx = projectX(col, row, this.camera, this.view);
        const sy = projectY(col, row, this.camera, this.view) - (stack.length - 1) * LAYER_H - palette.elev;
        if (Math.abs(px - sx) / HW + Math.abs(py - sy) / HH > 1) continue;
        if (!best || row + col > best.row + best.col) best = { row, col };
      }
    }
    return best;
  }

  /* ------------------------------ camera ------------------------------- */

  private update(dt: number): void {
    const { state } = this.game;
    const self = state.entities.find((entity) => entity.id === state.playerId);
    if (!self) return;

    const target = visualCell(self);
    // Critically damped enough to feel attached without snapping.
    const k = 1 - Math.exp(-6 * dt);
    this.camera.row += (target.row - this.camera.row) * k;
    this.camera.col += (target.col - this.camera.col) * k;

    /* Dragging is for looking around, and it stays put while you do. The
       moment he walks, the view comes back to him — and keeps easing after
       he stops, so a single step recentres as surely as a long one. */
    /* Recentre when he moves — and whenever the camera is still catching up
       with him. A lagging camera makes clampPan add pan to keep him on
       screen, and without this that pan outlived the lag: after any jump
       that was not a walk, the view stayed shoved to one side. */
    const lagging = Math.abs(target.row - this.camera.row) + Math.abs(target.col - this.camera.col) > 0.5;
    if (self.motion || self.path.length || lagging) this.recentring = true;
    this.clampPan();
    if (!this.recentring) return;

    const ease = 1 - Math.exp(-4 * dt);
    this.camera.panX -= this.camera.panX * ease;
    this.camera.panY -= this.camera.panY * ease;

    if (Math.abs(this.camera.panX) < 0.5 && Math.abs(this.camera.panY) < 0.5) {
      this.camera.panX = 0;
      this.camera.panY = 0;
      this.recentring = false;
    }
  }

  /* ------------------------------ drawing ------------------------------ */

  /** Is this the first row beyond a guardian that still stands? */
  private isGateLine(row: number): boolean {
    const { state } = this.game;
    return state.gates.some((gate) => {
      if (gate.row + 1 !== row) return false;
      const guardian = state.entities.find((entity) => entity.id === gate.guardianId);
      return !!guardian && !guardian.dead;
    });
  }

  /** Deep water, a few shades under the zone's own shallows. */
  private backdrop(): string {
    const zone = this.game.world.zoneAt(Math.round(this.camera.row));
    return darken(zone.palette.water.top, 0.58);
  }

  private paletteFor(row: number, letter: TileLetter): FacePalette {
    const kind: TileKind = KIND_OF[letter] ?? 'ground';
    return this.game.world.zoneAt(row).palette[kind];
  }

  private draw(now: number): void {
    const { ctx, view } = this;
    const { world, state } = this.game;
    this.overlay.length = 0;

    /* The land is an archipelago: everything that is not a tile is open
       water. Taken from the zone's own water colour and sunk a little
       darker, so the shallows on the map read as shallows against it. */
    ctx.fillStyle = this.backdrop();
    ctx.fillRect(0, 0, view.width, view.height);

    const reach = Math.ceil(view.width / TILE_W + view.height / TILE_H) + 10;
    const firstRow = Math.floor(this.camera.row) - reach;
    const lastRow = Math.ceil(this.camera.row) + reach;

    // Characters join the same depth order, by where they are right now.
    const cast = state.entities
      .map((entity) => ({ entity, pos: visualCell(entity) }))
      .map((item) => ({ ...item, depth: item.pos.row + item.pos.col }))
      .sort((a, b) => a.depth - b.depth);
    let next = 0;

    // Stacks and characters, far to near.
    for (let depth = firstRow; depth <= lastRow + world.width - 1; depth += 1) {
      for (let col = 0; col < world.width; col += 1) {
        const row = depth - col;
        if (row < firstRow || row > lastRow) continue;
        const stack = world.stackAt(row, col);
        if (stack === VOID) continue;

        const sx = projectX(col, row, this.camera, this.view);
        const sy = projectY(col, row, this.camera, this.view);
        if (sx < -TILE_W || sx > view.width + TILE_W) continue;
        if (sy < -TILE_H - MAX_STACK_HEIGHT * LAYER_H || sy > view.height + TILE_H + LAYER_H) continue;

        this.drawStack(sx, sy, stack, row, col, now);
      }

      while (next < cast.length && cast[next]!.depth <= depth + 0.0001) {
        this.drawEntity(cast[next]!.entity, cast[next]!.pos);
        next += 1;
      }
    }

    while (next < cast.length) {
      this.drawEntity(cast[next]!.entity, cast[next]!.pos);
      next += 1;
    }

    this.drawBursts(now);

    for (const { sx, top, entity } of this.overlay) {
      this.drawHealthBar(sx, top, entity);
      if (entity.faction === 'player') continue;
      if (entity.intent) this.drawIntent(sx, top - 15, entity.intent.label, entity.faction === 'ally');
      // What it is carrying, readable before you decide to fight it.
      if (entity.reward) this.drawRewardPill(sx, top - (entity.intent ? 32 : 16), entity.reward);
    }
  }

  private drawStack(sx: number, sy: number, stack: string, row: number, col: number, now: number): void {
    for (let layer = 0; layer < stack.length; layer += 1) {
      const letter = stack[layer] as TileLetter;
      const isTop = layer === stack.length - 1;
      this.drawBlock(sx, sy - layer * LAYER_H, this.paletteFor(row, letter), letter, isTop, row, col, now);
    }

    const ctx = this.ctx;
    const top = this.paletteFor(row, stack[stack.length - 1] as TileLetter);
    const ty = sy - (stack.length - 1) * LAYER_H - top.elev;

    const highlight = this.highlights.get(cellKey(row, col));
    const hovered = this.hover && this.hover.row === row && this.hover.col === col;

    /* In layers, from the ground up: the gate line and the grid highlights
       (movement, targets, the path) belong to the tile's surface, so they
       go down first; terrain marks sit on top of them, as things standing
       on the ground; then the area-aim preview; and the hover outline last,
       so the pointer's own feedback is never covered. */

    // The first row past a standing guardian, marked so the barrier reads
    // before you walk into it.
    if (this.isGateLine(row)) {
      ctx.save();
      diamondPath(ctx, sx, ty);
      ctx.fillStyle = 'rgba(190, 58, 44, 0.3)';
      ctx.fill();
      ctx.strokeStyle = '#e0785f';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#e0785f';
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.restore();
    }

    if (highlight || hovered) {
      const style = HIGHLIGHT[highlight ?? 'hover'];
      diamondPath(ctx, sx, ty);
      ctx.fillStyle = style.fill;
      ctx.fill();

      if (style.stroke) {
        ctx.save();
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = 2;
        if (style.glow) {
          ctx.shadowColor = style.stroke;
          ctx.shadowBlur = style.glow;
        }
        diamondPath(ctx, sx, ty);
        ctx.stroke();
        ctx.restore();
      }
    }

    const marks = this.game.state.terrain[`${row},${col}`];
    if (marks?.length) this.drawMarks(sx, ty, marks, row, col, now);

    // The area an area card would cover, where it is being aimed.
    if (this.aim?.cells.has(`${row},${col}`)) {
      ctx.save();
      diamondPath(ctx, sx, ty);
      ctx.fillStyle = 'rgba(254, 174, 52, 0.28)';
      ctx.fill();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = this.palette.yellow;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    if (hovered) {
      ctx.strokeStyle = 'rgba(246, 236, 170, 0.85)';
      ctx.lineWidth = 2;
      diamondPath(ctx, sx, ty);
      ctx.stroke();
    }
  }

  /* A marked tile, drawn in three layers so it reads as something sitting
     on the ground rather than a tint of it:

       - a faint stain on the tile itself, which reads as the shadow of —
       - a plate hovering a few units above the tile, bobbing slowly, with a
         stripe across it for each mark in the mark's own colour (fire and
         a healing spring on one tile read as red and green, not a blend)
         and highlights drifting over it the way the water's do —
       - motes in the marks' colours rising off it and fading.

     Past three marks the three newest show, and a count says how many.
     Positions come from `hash`, so each tile's motes are its own and never
     crawl as the camera moves; time only drives the motion. */
  private drawMarks(sx: number, ty: number, marks: readonly TerrainLayer[], row: number, col: number, now: number): void {
    const ctx = this.ctx;
    const shown = marks.slice(-3);
    const phase = (row + col) * 0.9;
    const t = now / 1000;

    // The stain: the stripes, faintly, in a circle on the tile itself —
    // the largest circle that sits inside the tile's diamond.
    this.stripes(sx, ty, 0.7, shown, 0.28);

    // The plate: a smaller circle, raised and bobbing.
    const lift = 11 + Math.sin(t * 2 + phase) * 2;
    const py = ty - lift;
    const scale = 0.62;
    const rx = HW * scale;
    const ry = HH * scale;

    // Its side: the front of a short cylinder from the ground up to the
    // plate — the first mark's colour on the left half, the newest on the
    // right — brightest at the base and fading upward.
    const halves: Array<[number, string]> = [[-1, shown[0]!.colour], [1, shown.at(-1)!.colour]];
    for (const [side, colour] of halves) {
      const glow = ctx.createLinearGradient(0, ty + ry, 0, py);
      glow.addColorStop(0, withAlpha(colour, 0.5));
      glow.addColorStop(1, withAlpha(colour, 0.08));
      ctx.save();
      ctx.beginPath();
      ctx.rect(side < 0 ? sx - rx - 1 : sx, py - ry, rx + 1, ty - py + ry * 2 + 1);
      ctx.clip();
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.moveTo(sx - rx, py);
      ctx.lineTo(sx - rx, ty);
      ctx.ellipse(sx, ty, rx, ry, 0, Math.PI, 0, true);     // front of the base
      ctx.lineTo(sx + rx, py);
      ctx.ellipse(sx, py, rx, ry, 0, 0, Math.PI, false);    // front of the plate
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    this.stripes(sx, py, scale, shown, 0.62);

    // Highlights drifting across it, as on the water.
    ctx.save();
    markCircle(ctx, sx, py, scale);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 2; i += 1) {
      const y = py + Math.sin(t * 1.4 + phase + i * 2.4) * HH * 0.3 + (i - 0.5) * 6;
      ctx.moveTo(sx - HW * 0.28, y);
      ctx.lineTo(sx + HW * 0.28, y);
    }
    ctx.stroke();
    ctx.restore();

    // Its rim, in the newest mark's colour, and a darker lip under it for
    // thickness.
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = this.palette.ink;
    ctx.lineWidth = 2;
    markCircle(ctx, sx, py + 2, scale);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = shown.at(-1)!.colour;
    ctx.lineWidth = 1.5;
    markCircle(ctx, sx, py, scale);
    ctx.stroke();
    ctx.restore();

    // Motes rising off it, each a mark's colour, fading as they climb.
    const MOTES = 9;
    const RISE = 38;
    ctx.save();
    for (let i = 0; i < MOTES; i += 1) {
      const a = hash(row, col, i + 300) * 2 - 1;
      const b = hash(row, col, i + 340) * 2 - 1;
      const speed = 0.35 + hash(row, col, i + 380) * 0.3;
      const age = (t * speed + hash(row, col, i + 420)) % 1;
      const mark = shown[i % shown.length]!;
      ctx.globalAlpha = 0.85 * (1 - age);
      ctx.fillStyle = mark.colour;
      const x = sx + (a - b) * HW * 0.45 * scale;
      const y = py + (a + b) * HH * 0.45 * scale - age * RISE;
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    }
    ctx.restore();

    if (marks.length > shown.length) {
      const { ink, text, font } = this.palette;
      ctx.font = `8px ${font}`;
      const label = `×${marks.length}`;
      const w = Math.ceil(ctx.measureText(label).width) + 6;
      ctx.fillStyle = ink;
      ctx.fillRect(Math.round(sx - w / 2), Math.round(py - 6), w, 11);
      ctx.fillStyle = text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, sx, py);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
  }

  /* An area burst as it goes off: every tile it covered flashes in its
     colour and fades, and a ring spreads from the centre. Each burst is
     drawn once, from the moment the renderer first sees it. */
  private drawBursts(now: number): void {
    const DURATION = 650;
    const ctx = this.ctx;
    for (const burst of this.game.state.bursts) {
      if (!this.burstStarts.has(burst.id)) this.burstStarts.set(burst.id, now);
      const age = (now - this.burstStarts.get(burst.id)!) / DURATION;
      if (age < 0 || age >= 1) continue;
      const fade = 1 - age;
      let cx = 0;
      let cy = 0;
      for (const cell of burst.cells) {
        const top = this.tileTop(cell);
        if (!top) continue;
        cx += top.x;
        cy += top.y;
        ctx.save();
        diamondPath(ctx, top.x, top.y);
        ctx.globalAlpha = 0.65 * fade;
        ctx.fillStyle = burst.colour;
        ctx.fill();
        ctx.restore();
      }
      if (!burst.cells.length) continue;
      cx /= burst.cells.length;
      cy /= burst.cells.length;
      const reach = (Math.sqrt(burst.cells.length) * 0.6 + 0.5) * HW * (0.4 + age * 0.9);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = burst.colour;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, reach, reach * (HH / HW), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // Forget bursts the game has already dropped.
    const live = new Set(this.game.state.bursts.map((burst) => burst.id));
    for (const id of this.burstStarts.keys()) if (!live.has(id)) this.burstStarts.delete(id);
  }

  /** Where a tile's top face sits, in design units. */
  private tileTop(cell: Cell): { x: number; y: number } | null {
    const stack = this.game.world.stackAt(cell.row, cell.col);
    if (stack === VOID) return null;
    const palette = this.paletteFor(cell.row, stack[stack.length - 1] as TileLetter);
    return {
      x: projectX(cell.col, cell.row, this.camera, this.view),
      y: projectY(cell.col, cell.row, this.camera, this.view) - (stack.length - 1) * LAYER_H - palette.elev,
    };
  }

  /** A circle (an ellipse, seen at this angle) filled with a vertical
   *  stripe per mark. */
  private stripes(sx: number, sy: number, scale: number, marks: readonly TerrainLayer[], alpha: number): void {
    const ctx = this.ctx;
    const w = TILE_W * scale;
    const band = w / marks.length;
    ctx.save();
    markCircle(ctx, sx, sy, scale);
    ctx.clip();
    ctx.globalAlpha = alpha;
    marks.forEach((mark, i) => {
      ctx.fillStyle = mark.colour;
      ctx.fillRect(sx - w / 2 + i * band, sy - (TILE_H * scale) / 2, band + 0.5, TILE_H * scale);
    });
    ctx.restore();
  }

  /** One block: two walls, and a top face only when nothing is stacked on
   *  it. A buried block never sinks, so no seam can open above it. */
  private drawBlock(
    sx: number,
    sy: number,
    palette: FacePalette,
    letter: TileLetter,
    isTop: boolean,
    row: number,
    col: number,
    now: number,
  ): void {
    const ctx = this.ctx;
    const ty = sy - (isTop ? palette.elev : 0);
    const base = sy + LAYER_H;

    ctx.fillStyle = palette.left;
    ctx.beginPath();
    ctx.moveTo(sx - HW, ty);
    ctx.lineTo(sx, ty + HH);
    ctx.lineTo(sx, base + HH);
    ctx.lineTo(sx - HW, base);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(24, 48, 36, 0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = palette.right;
    ctx.beginPath();
    ctx.moveTo(sx, ty + HH);
    ctx.lineTo(sx + HW, ty);
    ctx.lineTo(sx + HW, base);
    ctx.lineTo(sx, base + HH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (!isTop) return;

    diamondPath(ctx, sx, ty);
    ctx.fillStyle = palette.top;
    ctx.fill();

    ctx.save();
    ctx.clip();
    this.drawTexture(palette.texture, sx, ty, row, col, now);
    ctx.restore();

    ctx.strokeStyle = 'rgba(24, 48, 36, 0.18)';
    diamondPath(ctx, sx, ty);
    ctx.stroke();
  }

  private drawTexture(
    texture: FacePalette['texture'],
    sx: number,
    sy: number,
    row: number,
    col: number,
    now: number,
  ): void {
    const ctx = this.ctx;
    switch (texture) {
      case 'blades':
        ctx.strokeStyle = 'rgba(46, 82, 44, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const a = hash(row, col, i) * 2 - 1;
          const b = hash(row, col, i + 40) * 2 - 1;
          const x = sx + (a - b) * HW * 0.42;
          const y = sy + (a + b) * HH * 0.42;
          ctx.moveTo(x, y);
          ctx.lineTo(x + 1, y - 5);
        }
        ctx.stroke();
        break;
      case 'speckle':
        ctx.fillStyle = 'rgba(104, 66, 38, 0.42)';
        for (let i = 0; i < 10; i += 1) {
          const a = hash(row, col, i) * 2 - 1;
          const b = hash(row, col, i + 70) * 2 - 1;
          ctx.fillRect(sx + (a - b) * HW * 0.44, sy + (a + b) * HH * 0.44, 2, 2);
        }
        break;
      case 'ripple':
        ctx.strokeStyle = 'rgba(224, 248, 244, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 3; i += 1) {
          const y = sy + Math.sin(now * 0.0014 + (row + col) * 0.7 + i * 2.1) * HH * 0.28 + (i - 1) * 7;
          ctx.moveTo(sx - HW * 0.3, y);
          ctx.lineTo(sx + HW * 0.3, y);
        }
        ctx.stroke();
        break;
      case 'grain':
        ctx.strokeStyle = 'rgba(30, 34, 36, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 4; i += 1) {
          const a = hash(row, col, i + 120) * 2 - 1;
          ctx.moveTo(sx + a * HW * 0.4 - 6, sy + a * HH * 0.3);
          ctx.lineTo(sx + a * HW * 0.4 + 6, sy + a * HH * 0.3 + 2);
        }
        ctx.stroke();
        break;
      case 'none':
        break;
    }
  }

  /** A sprite standing upright in the middle of its tile, plus the bits the
   *  player has to be able to read: health, and what an enemy intends. */
  private drawEntity(entity: Entity, pos: { row: number; col: number }): void {
    const ctx = this.ctx;
    const def = entityDef(entity.defId);
    const style = def.sprite;
    const clip = def.animations[entity.anim.state];

    const sx = projectX(pos.col, pos.row, this.camera, this.view);
    const sy = projectY(pos.col, pos.row, this.camera, this.view) - this.surfaceOffset(pos);

    if (sx < -TILE_W * 2 || sx > this.view.width + TILE_W * 2) return;
    if (sy < -TILE_H * 6 || sy > this.view.height + TILE_H * 4) return;

    // Shadow first, so the character is planted on the tile rather than
    // floating above it — and so an unloaded sheet still shows occupancy.
    ctx.fillStyle = 'rgba(16, 30, 24, 0.3)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, HW * 0.34, HH * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();

    // An ally stands in a ring of the player's colour, so which side it is
    // on reads at a glance, before any tooltip. A summoned creature's ring
    // is dashed and slowly turns — in its side's colour, so an enemy's
    // summons read as summoned too.
    // Caught in the area being aimed, on the player's own side: a blinking
    // red warning ring, so friendly fire is never a surprise.
    if (this.aim?.friends.has(entity.id)) {
      ctx.save();
      ctx.strokeStyle = this.palette.red;
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(performance.now() / 110);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(sx, sy, HW * 0.5, HH * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (entity.faction === 'ally' || entity.summonedBy) {
      const t = performance.now();
      ctx.save();
      ctx.strokeStyle = entity.faction === 'enemy' ? this.palette.red : this.palette.cyan;
      ctx.globalAlpha = 0.75 + 0.2 * Math.sin(t / 300);
      ctx.lineWidth = 2;
      if (entity.summonedBy) {
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -t / 60;
      }
      ctx.beginPath();
      ctx.ellipse(sx, sy, HW * 0.42, HH * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const frame = frameFor(style, def.animations, clip, entity.anim.frame);
    if (!frame) return;

    // Fit the artwork inside its footprint, keeping its proportions, and
    // stand it on the tile: the sheet art is centred on the bottom of its
    // cell, so the bottom edge of the measured content is where it rests.
    const move = this.motionOf(entity, clip, pos);

    const fit = Math.min(style.footprint.width / frame.sw, style.footprint.height / frame.sh);
    const width = frame.sw * fit;
    const height = frame.sh * fit * move.squash;

    const nudge = style.offsetY ?? 0;

    ctx.save();
    ctx.globalAlpha = move.alpha;
    ctx.translate(sx + move.lunge * entity.facing, sy + move.bob + nudge);
    if (move.tilt) ctx.rotate(move.tilt * entity.facing);
    // The artwork already points one way; only flip when it should not.
    if (entity.facing !== style.faces) ctx.scale(-1, 1);
    // `bottom` is where the feet are inside the frame, so this stands the
    // character on the tile however much empty space the sheet leaves.
    ctx.drawImage(
      frame.image,
      frame.sx, frame.sy, frame.sw, frame.sh,
      -width / 2, -height * frame.bottom, width, height,
    );
    ctx.restore();

    if (entity.dead) return;
    // Likewise the bar sits above the artwork, not above the empty frame,
    // and follows the same nudge so it stays a fixed gap off the head.
    const crown = sy + nudge + height * (frame.top - frame.bottom);
    this.overlay.push({ sx, top: crown - 10, entity });
  }

  /* A clip with one frame is a still picture, so the life has to come from
     moving it: a breath at rest, a bounce while walking, a lunge into an
     attack, a shudder when hit. A clip with real frames animates itself and
     is left alone — which is why this faded out for Caden the moment his
     cycles arrived, and still carries the enemies. */
  private motionOf(
    entity: Entity,
    clip: { frames: number; fps: number },
    pos: { row: number; col: number },
  ): { bob: number; lunge: number; tilt: number; alpha: number; squash: number } {
    const still = { bob: 0, lunge: 0, tilt: 0, alpha: 1, squash: 1 };
    if (clip.frames > 1) return still;

    const now = performance.now() / 1000;
    // Offset by position so a crowd does not breathe in unison.
    const offset = pos.row * 0.7 + pos.col * 1.3;
    const progress = entity.anim.done ? 1 : Math.min(1, entity.anim.elapsed * clip.fps);

    switch (entity.anim.state) {
      case 'idle':
        return { ...still, bob: Math.sin(now * 2.2 + offset) * 1.6 };
      case 'walk':
        return {
          ...still,
          bob: -Math.abs(Math.sin(now * 9 + offset)) * 4,
          tilt: Math.sin(now * 9 + offset) * 0.05,
        };
      case 'attack':
      case 'ranged':
        return {
          ...still,
          lunge: Math.sin(progress * Math.PI) * 12,
          bob: -Math.sin(progress * Math.PI) * 4,
        };
      case 'hurt':
        return {
          ...still,
          lunge: -Math.sin(progress * Math.PI * 3) * 6,
          alpha: 0.5 + 0.5 * Math.abs(Math.cos(progress * Math.PI * 3)),
        };
      case 'die':
        return {
          bob: progress * 6,
          lunge: 0,
          tilt: progress * 0.6,
          alpha: 1 - progress * 0.9,
          squash: 1 - progress * 0.25,
        };
      default:
        return still;
    }
  }

  /** How far above the base of a cell its walking surface sits, including
   *  the part-way height of a character stepping between two levels. */
  private surfaceOffset(pos: { row: number; col: number }): number {
    const world = this.game.world;
    const a = { row: Math.floor(pos.row), col: Math.floor(pos.col) };
    const b = { row: Math.ceil(pos.row), col: Math.ceil(pos.col) };
    const ha = world.heightAt(a.row, a.col);
    const hb = world.heightAt(b.row, b.col);
    const mix = Math.max(pos.row - a.row, pos.col - a.col);
    const height = ha + (hb - ha) * mix;
    return Math.max(0, height - 1) * LAYER_H;
  }

  /* Chips are pixel-style like the HUD: a black outline, a flat fill, no
     rounding. Everything is snapped to whole design units so the outline
     stays one crisp line. */
  private drawHealthBar(sx: number, sy: number, entity: Entity): void {
    const ctx = this.ctx;
    const { ink, green, red, blue } = this.palette;
    const w = 34;
    const h = 4;
    const x = Math.round(sx - w / 2);
    const y = Math.round(sy);
    const tall = entity.block > 0 ? h + 2 : h;
    ctx.fillStyle = ink;
    ctx.fillRect(x - 1, y - 1, w + 2, tall + 2);
    // The player's side is green, the enemy red.
    ctx.fillStyle = entity.faction === 'enemy' ? red : green;
    ctx.fillRect(x, y, Math.round(w * Math.max(0, entity.hp / entity.maxHp)), h);
    if (entity.block > 0) {
      ctx.fillStyle = blue;
      ctx.fillRect(x, y + h, Math.round(w * Math.min(1, entity.block / entity.maxHp)), 2);
    }
  }

  /** Screen position of the middle of a tile's top face, in client
   *  coordinates — where the HUD anchors a marked tile's tip. */
  tileTopOf(cell: Cell): { x: number; y: number } | null {
    const stack = this.game.world.stackAt(cell.row, cell.col);
    if (stack === VOID) return null;
    const palette = this.paletteFor(cell.row, stack[stack.length - 1] as TileLetter);
    const sx = projectX(cell.col, cell.row, this.camera, this.view);
    const sy = projectY(cell.col, cell.row, this.camera, this.view) - (stack.length - 1) * LAYER_H - palette.elev;
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + sx * this.scale, y: rect.top + (sy - HH) * this.scale };
  }

  /** Screen position of the point a character's health bar hangs from, in
   *  client coordinates — where the HUD anchors its hover tip. */
  crownOf(entityId: string): { x: number; y: number } | null {
    const entry = this.overlay.find((item) => item.entity.id === entityId);
    if (!entry) return null;
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + entry.sx * this.scale,
      y: rect.top + entry.top * this.scale,
    };
  }

  private drawRewardPill(sx: number, sy: number, reward: Reward): void {
    const ctx = this.ctx;
    const { ink, yellow, green, font } = this.palette;
    const label = rewardLabel(reward);
    const tint = reward.kind === 'gem'
      ? gemDef(reward.gemId).colour
      : reward.kind === 'talisman' ? yellow : green;

    ctx.font = `8px ${font}`;
    const width = Math.ceil(ctx.measureText(label).width) + 8;
    const x = Math.round(sx - width / 2);
    const y = Math.round(sy - 10);

    // A solid tag in the reward's colour, as in the enemy tip.
    ctx.fillStyle = ink;
    ctx.fillRect(x - 1, y - 1, width + 2, 14);
    ctx.fillStyle = tint;
    ctx.fillRect(x, y, width, 12);

    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + width / 2, y + 6);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  private drawIntent(sx: number, sy: number, label: string, ally = false): void {
    const ctx = this.ctx;
    const { panel, text, font } = this.palette;
    // An ally's chip is edged in the player's colour instead of black.
    const ink = ally ? this.palette.cyan : this.palette.ink;
    ctx.font = `8px ${font}`;
    const upper = label.toUpperCase();
    const width = Math.ceil(ctx.measureText(upper).width) + 10;
    const x = Math.round(sx - width / 2);
    const y = Math.round(sy - 10);

    ctx.fillStyle = ink;
    ctx.fillRect(x - 1, y - 1, width + 2, 16);
    ctx.fillStyle = panel;
    ctx.fillRect(x, y, width, 14);
    ctx.fillStyle = text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(upper, x + width / 2, y + 7);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}

/** Where a character is right now — between two cells while it walks. */
/** A #rrggbb colour as rgba, at this opacity. */
function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${alpha})`;
}

/** A circle lying flat on the ground, which the projection turns into an
 *  ellipse half as tall as it is wide — the tile's own proportions. At
 *  scale 1 it passes through the tile's corners; 0.7 sits inside it. */
function markCircle(ctx: CanvasRenderingContext2D, sx: number, sy: number, scale: number): void {
  ctx.beginPath();
  ctx.ellipse(sx, sy, HW * scale, HH * scale, 0, 0, Math.PI * 2);
}

/** Scale a #rrggbb colour towards black. */
function darken(hex: string, factor: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((value >> shift) & 0xff) * factor)));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

export function visualCell(entity: Entity): { row: number; col: number } {
  if (!entity.motion) return { row: entity.row, col: entity.col };
  const { from, to, t } = entity.motion;
  const clamped = Math.min(1, Math.max(0, t));
  return {
    row: from.row + (to.row - from.row) * clamped,
    col: from.col + (to.col - from.col) * clamped,
  };
}

/** Re-exported so the store can drive the simulation from the render loop. */
export { tick };
