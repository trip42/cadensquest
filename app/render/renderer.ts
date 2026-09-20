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
import type { Cell } from '../game/map/navigation';
import { KIND_OF, type FacePalette, type TileKind, type TileLetter, VOID } from '../game/map/tiles';
import type { Game } from '../game/state';
import {
  type Camera,
  DESIGN_H,
  DESIGN_W,
  FOCUS_X,
  FOCUS_Y,
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

export class MapRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly game: Game;
  private readonly hooks: RendererHooks;

  private view: Viewport = { width: DESIGN_W, height: DESIGN_H };
  private camera: Camera = { row: 0, col: 0, panX: 0, panY: 0, focusX: FOCUS_X, focusY: FOCUS_Y };
  private scale = 1;
  private raf = 0;
  private last = 0;
  private observer: ResizeObserver | null = null;

  private highlights = new Map<string, HighlightKind>();
  private hover: Cell | null = null;
  /* Health and intent belong on top of the scene, not inside it: drawn in
     the depth pass they get painted over by whoever stands in front. */
  private overlay: Array<{ sx: number; top: number; entity: Entity }> = [];

  constructor(canvas: HTMLCanvasElement, game: Game, hooks: RendererHooks = {}) {
    this.canvas = canvas;
    this.game = game;
    this.hooks = hooks;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;

    const self = game.state.entities.find((entity) => entity.id === game.state.playerId)!;
    this.camera.row = self.row;
    this.camera.col = self.col;

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
  }

  /* ------------------------------ input -------------------------------- */

  setHighlights(highlights: Map<string, HighlightKind>): void {
    this.highlights = highlights;
  }

  setHover(cell: Cell | null): void {
    this.hover = cell;
  }

  pan(dx: number, dy: number): void {
    this.camera.panX += dx / this.scale;
    this.camera.panY += dy / this.scale;
  }

  recentre(): void {
    this.camera.panX = 0;
    this.camera.panY = 0;
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
  }

  /* ------------------------------ drawing ------------------------------ */

  private paletteFor(row: number, letter: TileLetter): FacePalette {
    const kind: TileKind = KIND_OF[letter] ?? 'ground';
    return this.game.world.zoneAt(row).palette[kind];
  }

  private draw(now: number): void {
    const { ctx, view } = this;
    const { world, state } = this.game;
    ctx.clearRect(0, 0, view.width, view.height);
    this.overlay.length = 0;

    const reach = Math.ceil(view.width / TILE_W + view.height / TILE_H) + 10;
    const firstRow = Math.floor(this.camera.row) - reach;
    const lastRow = Math.ceil(this.camera.row) + reach;

    // Pass one: the faint ground lattice, under the gaps and the open
    // country either side. Drawn first so solid tiles always cover it.
    ctx.strokeStyle = 'rgba(226, 240, 214, 0.07)';
    ctx.lineWidth = 1;
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let col = -5; col < world.width + 5; col += 1) {
        const inside = col >= 0 && col < world.width;
        if (inside && world.stackAt(row, col) !== VOID) continue;
        const sx = projectX(col, row, this.camera, this.view);
        const sy = projectY(col, row, this.camera, this.view);
        if (sx < -TILE_W || sx > view.width + TILE_W || sy < -TILE_H || sy > view.height + TILE_H) continue;
        diamondPath(ctx, sx, sy);
        ctx.stroke();
      }
    }

    // Characters join the same depth order, by where they are right now.
    const cast = state.entities
      .map((entity) => ({ entity, pos: visualCell(entity) }))
      .map((item) => ({ ...item, depth: item.pos.row + item.pos.col }))
      .sort((a, b) => a.depth - b.depth);
    let next = 0;

    // Pass two: stacks and characters, far to near.
    for (let depth = firstRow; depth <= lastRow + world.width - 1; depth += 1) {
      for (let col = 0; col < world.width; col += 1) {
        const row = depth - col;
        if (row < firstRow || row > lastRow) continue;
        const stack = world.stackAt(row, col);
        if (stack === VOID) continue;

        const sx = projectX(col, row, this.camera, this.view);
        const sy = projectY(col, row, this.camera, this.view);
        if (sx < -TILE_W || sx > view.width + TILE_W) continue;
        if (sy < -TILE_H - 6 * LAYER_H || sy > view.height + TILE_H + LAYER_H) continue;

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

    for (const { sx, top, entity } of this.overlay) {
      this.drawHealthBar(sx, top, entity);
      if (entity.faction === 'enemy' && entity.intent) this.drawIntent(sx, top - 14, entity.intent.label);
    }
  }

  private drawStack(sx: number, sy: number, stack: string, row: number, col: number, now: number): void {
    for (let layer = 0; layer < stack.length; layer += 1) {
      const letter = stack[layer] as TileLetter;
      const isTop = layer === stack.length - 1;
      this.drawBlock(sx, sy - layer * LAYER_H, this.paletteFor(row, letter), letter, isTop, row, col, now);
    }

    const highlight = this.highlights.get(cellKey(row, col));
    const hovered = this.hover && this.hover.row === row && this.hover.col === col;
    if (!highlight && !hovered) return;

    const ctx = this.ctx;
    const top = this.paletteFor(row, stack[stack.length - 1] as TileLetter);
    const ty = sy - (stack.length - 1) * LAYER_H - top.elev;
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

    if (hovered) {
      ctx.strokeStyle = 'rgba(246, 236, 170, 0.85)';
      ctx.lineWidth = 2;
      diamondPath(ctx, sx, ty);
      ctx.stroke();
    }
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

  private drawHealthBar(sx: number, sy: number, entity: Entity): void {
    const ctx = this.ctx;
    const w = 34;
    const h = 4;
    ctx.fillStyle = 'rgba(12, 24, 20, 0.7)';
    ctx.fillRect(sx - w / 2, sy, w, h);
    ctx.fillStyle = entity.faction === 'player' ? '#a8d06a' : '#d0644e';
    ctx.fillRect(sx - w / 2, sy, w * Math.max(0, entity.hp / entity.maxHp), h);
    if (entity.block > 0) {
      ctx.fillStyle = '#7fb4d6';
      ctx.fillRect(sx - w / 2, sy + h, w * Math.min(1, entity.block / entity.maxHp), 2);
    }
  }

  private drawIntent(sx: number, sy: number, label: string): void {
    const ctx = this.ctx;
    ctx.font = '9px "DM Mono", ui-monospace, monospace';
    const width = ctx.measureText(label).width + 10;
    ctx.fillStyle = 'rgba(12, 24, 20, 0.78)';
    ctx.fillRect(sx - width / 2, sy - 10, width, 13);
    ctx.fillStyle = '#e7d69a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, sx, sy - 3);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}

/** Where a character is right now — between two cells while it walks. */
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
