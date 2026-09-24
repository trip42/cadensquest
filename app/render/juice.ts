/* Juice: what the game does to your eyes and ears when something happens.

   The rules push cues (game/cues.ts); this takes the new ones each frame
   and turns them into sound, numbers, flashes, sparks, shake and the odd
   frozen instant — and works out when each blow *lands*, which is not when
   the rules resolve it. The rules deal damage the moment a card is played
   or an enemy acts, as the attacker starts its swing; the thud, the number
   and the flash belong a beat later, at contact, or when a thrown thing
   arrives. Everything a blow sets off is timed from that.

   It keeps its own little world of effects, anchored to cells so they stay
   put as the camera moves, and draws them in design units like the rest of
   the renderer. It never writes to the game. Time is in seconds. */

import { soundsFor } from '../audio/cues';
import { sfx, type SoundPlayer } from '../audio/player';
import { type Cue, cuesSince, type SeqCue } from '../game/cues';
import { type Cell, cellDistance } from '../game/map/navigation';
import type { Game } from '../game/state';

/** Seconds from the start of a swing to contact. */
export const MELEE_CONTACT = 0.09;

/** Seconds a thrown or cast blow takes to arrive, by how far it flies. */
export function flightTime(from: Cell | undefined, to: Cell): number {
  const distance = from ? cellDistance(from, to) : 1;
  return Math.min(0.3, 0.1 + 0.035 * distance);
}

/** The HUD colours and face, as the renderer read them from main.css. */
export interface JuicePalette {
  ink: string; text: string; red: string; green: string; blue: string; yellow: string; cyan: string; font: string;
}

/** What the juice needs from whoever draws the map. */
export interface Stage {
  /** Where a tile's top face is, in design units, or null if it is not
   *  there. Rings lie on it; sounds are panned by it. */
  locate(cell: Cell): { x: number; y: number } | null;
  /** Where a creature standing on the cell has its feet. */
  feet(cell: Cell): { x: number; y: number };
  /** How far above its feet a creature's health bar hangs — its height,
   *  for where on it things happen. */
  heightOf(entityId: string): number;
  /** The main colour of a creature's picture, for its shards. */
  colourOf(entityId: string): string | null;
  width: number;
  height: number;
}

interface Anchored {
  /** Where it is pinned: a cell, and how far above the feet there. */
  cell: Cell;
  lift: number;
  start: number;
  life: number;
}

interface FloatText extends Anchored {
  text: string;
  colour: string;
  size: number;
  /** Sideways, so two numbers at once do not sit on each other. */
  dx: number;
  /** Stacked above earlier ones on the same creature. */
  dy: number;
}

interface Particle extends Anchored {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  colour: string;
}

interface Shot {
  from: Cell;
  to: Cell;
  fromLift: number;
  toLift: number;
  start: number;
  arrive: number;
  colour: string;
}

interface Ring extends Anchored {
  colour: string;
  /** Radius, as a fraction of a tile's half-width, at the start and end. */
  from: number;
  to: number;
  width: number;
}

interface Fade {
  colour: string;
  start: number;
  life: number;
  peak: number;
}

export interface JuiceOptions {
  /** Less motion: no shake, gentler flashes, fewer particles — for anyone
   *  who has asked their system to reduce motion. */
  calm?: boolean;
  palette?: JuicePalette;
  /** Where sounds go; the page's player unless a test says otherwise. */
  sound?: Pick<SoundPlayer, 'play'>;
  /** Randomness for the look of things — never the game's rng. */
  random?: () => number;
}

const DEFAULT_PALETTE: JuicePalette = {
  ink: '#0b0b17', text: '#f4f4f4', red: '#e43b44', green: '#63c74d', blue: '#0099db',
  yellow: '#feae34', cyan: '#2ce8f5', font: "'Silkscreen', monospace",
};

/** The colour a thrown blow glows: the player's side cool, enemies warm. */
const FRIENDLY_SHOT = '#7df9ff';
const ENEMY_SHOT = '#ff8a3d';

export class Juice {
  private readonly game: Game;
  private readonly calm: boolean;
  private readonly palette: JuicePalette;
  private readonly sound: Pick<SoundPlayer, 'play'>;
  private readonly random: () => number;

  /** The last cue handled. */
  private seen: number;
  /** When each creature's latest blow lands — so it falls when the blow
   *  that killed it lands, not before. */
  private readonly lands = new Map<string, number>();

  private later: Array<{ at: number; run: () => void }> = [];
  texts: FloatText[] = [];
  particles: Particle[] = [];
  shots: Shot[] = [];
  rings: Ring[] = [];
  private fades: Fade[] = [];
  private readonly flashes = new Map<string, { colour: string; start: number; life: number }>();
  /** How hard the screen is shaking, 0..1; it settles by itself. */
  trauma = 0;
  /** The simulation holds still until then: hit-stop. */
  private freezeUntil = 0;
  private lastUpdate = 0;

  constructor(game: Game, options: JuiceOptions = {}) {
    this.game = game;
    this.calm = options.calm ?? false;
    this.palette = options.palette ?? DEFAULT_PALETTE;
    this.sound = options.sound ?? sfx;
    this.random = options.random ?? Math.random;
    // Only what happens from now on: a map built part-way through a run
    // does not replay the cues that came before it.
    this.seen = game.state.cueSeq;
  }

  /* ------------------------------ taking cues -------------------------- */

  /** Take whatever has been cued since the last frame. */
  take(now: number, stage: Stage): void {
    const { state } = this.game;
    if (state.cueSeq === this.seen) return;
    for (const item of cuesSince(state, this.seen)) this.handle(item, now, stage);
    this.seen = state.cueSeq;
  }

  private handle(item: SeqCue, now: number, stage: Stage): void {
    const impact = this.impactOf(item, now);
    this.hear(item, impact, stage);
    this.see(item, now, impact, stage);
  }

  /** Seconds from now until this cue's blow lands — 0 for anything that is
   *  not a blow, or lands at once. */
  impactOf(item: Cue, now: number): number {
    if (item.type === 'hit') {
      const delay = item.via !== 'blow' ? 0 : item.ranged ? flightTime(item.from, item.cell) : MELEE_CONTACT;
      this.lands.set(item.target, now + delay);
      return delay;
    }
    if (item.type === 'fall') {
      const at = this.lands.get(item.target);
      this.lands.delete(item.target);
      return at !== undefined && at > now ? at - now : 0;
    }
    return 0;
  }

  private hear(item: Cue, impact: number, stage: Stage): void {
    const where = cellOf(item);
    const point = where ? stage.locate(where) : null;
    const pan = point && stage.width ? clamp((point.x - stage.width / 2) / (stage.width / 2), -1, 1) * 0.6 : 0;
    const mine = 'target' in item && item.target === this.game.state.playerId;
    for (const { name, ...options } of soundsFor(item, { impact, mine })) {
      this.sound.play(name, { ...options, pan });
    }
  }

  private see(item: Cue, now: number, impact: number, stage: Stage): void {
    const { palette } = this;
    const at = now + impact;
    switch (item.type) {
      case 'hit': {
        const tall = stage.heightOf(item.target);
        if (item.via === 'blow' && item.ranged && item.from) {
          const byTall = item.by ? stage.heightOf(item.by) : 60;
          this.shots.push({
            from: item.from, to: item.cell, fromLift: byTall * 0.55, toLift: tall * 0.5,
            start: now, arrive: at, colour: item.side === 'enemy' ? FRIENDLY_SHOT : ENEMY_SHOT,
          });
        }
        this.schedule(at, () => this.landHit(item, at, tall));
        break;
      }
      case 'fall': {
        const tall = stage.heightOf(item.target);
        // A picture's average colour is darker than it looks: lift it.
        const colour = lighten(stage.colourOf(item.target) ?? palette.cyan, 0.35);
        this.schedule(at, () => {
          if (item.faded) {
            this.motes(item.cell, tall * 0.5, colour, 12, at);
            return;
          }
          this.shards(item.cell, tall * 0.5, colour, at, item.guardian ? 40 : 22);
          this.ring(item.cell, lighten(colour, 0.4), at, 0.5, 0.25, 1.1, 3);
          this.shake(item.guardian ? 0.55 : item.side === 'player' ? 0.5 : 0.15);
          this.freeze(at, item.guardian ? 0.2 : item.side === 'player' ? 0.25 : 0.05);
          if (item.guardian) this.fade(palette.text, at, 0.35, 0.35);
        });
        break;
      }
      case 'gain': {
        const tall = stage.heightOf(item.target);
        const colour = item.stat === 'block' ? palette.blue : item.stat === 'heal' ? palette.green : palette.yellow;
        const label = item.stat === 'block' ? `+${item.amount} BLOCK` : item.stat === 'heal' ? `+${item.amount}` : `+${item.amount} POWER`;
        this.text(item.cell, tall, label, colour, item.stat === 'heal' ? 16 : 12, now);
        this.flash(item.target, colour, now, 0.25, 0.5);
        if (item.stat === 'block') this.ring(item.cell, colour, now, 0.35, 0.6, 0.35, 2, tall * 0.45);
        else this.motes(item.cell, tall * 0.4, colour, item.stat === 'heal' ? 10 : 7, now);
        break;
      }
      case 'tame':
      case 'summon': {
        const tall = stage.heightOf(item.target);
        const colour = item.type === 'summon' && item.side === 'enemy' ? palette.red : palette.cyan;
        this.ring(item.cell, colour, now, 0.55, 0.2, 1, 3);
        this.motes(item.cell, tall * 0.3, colour, 14, now);
        this.flash(item.target, colour, now, 0.35, 0.7);
        if (item.type === 'tame') this.text(item.cell, tall, 'TAMED', colour, 12, now);
        break;
      }
      case 'mark':
        for (const cell of item.cells) this.ring(cell, item.colour, now, 0.5, 0.25, 0.9, 3);
        break;
      case 'burst':
        this.shake(0.4);
        this.freeze(now, 0.05);
        break;
      case 'step':
        if (!this.calm) this.dust(item.cell, now);
        break;
      case 'portal':
        this.ring(item.cell, palette.text, now, 0.9, 0.2, 1.6, 4);
        this.ring(item.cell, palette.cyan, now + 0.12, 0.8, 0.2, 1.2, 2);
        this.motes(item.cell, 20, palette.text, 24, now, 1.4);
        this.shake(0.25);
        break;
      case 'descend':
        this.fade('#ffffff', now, 0.9, 1);
        break;
      case 'end':
        if (item.outcome === 'died') this.fade(palette.red, now, 0.8, 0.35);
        else this.fade('#ffffff', now, 1, 0.8);
        break;
      default:
        break;
    }
  }

  /** A blow arriving: the number, the flash, sparks, shake and a frozen
   *  instant — heavier for a big blow, and heaviest when it is Caden hit. */
  private landHit(item: Extract<Cue, { type: 'hit' }>, at: number, tall: number): void {
    const { palette } = this;
    const mine = item.side === 'player';
    const friend = item.side !== 'enemy';
    const heavy = item.fatal || item.amount >= 10;
    if (item.amount > 0) {
      const colour = friend ? palette.red : heavy ? palette.yellow : palette.text;
      this.text(item.cell, tall, `-${item.amount}`, colour, heavy ? 24 : 16, at);
      this.flash(item.target, '#ffffff', at, 0.14, 0.9);
      this.sparks(item.cell, tall * 0.5, friend ? palette.red : '#fff3b0', at, heavy ? 12 : 8);
    }
    if (item.blocked > 0) {
      this.text(item.cell, tall, `${item.blocked} BLOCKED`, palette.blue, 12, at);
      if (!item.amount) this.flash(item.target, palette.blue, at, 0.16, 0.7);
      this.sparks(item.cell, tall * 0.5, palette.blue, at, 5);
    }
    if (mine && item.amount > 0) {
      this.shake(Math.min(0.75, 0.3 + item.amount * 0.03));
      this.freeze(at, Math.min(0.12, 0.05 + item.amount * 0.005));
    } else if (item.amount > 0) {
      this.shake(Math.min(0.35, 0.05 + item.amount * 0.015));
      if (heavy) this.freeze(at, 0.05);
    }
  }

  /* ------------------------------ effects ------------------------------ */

  private schedule(at: number, run: () => void): void {
    this.later.push({ at, run });
  }

  private text(cell: Cell, tall: number, text: string, colour: string, size: number, start: number): void {
    // Stack above whatever is already showing there.
    const recent = this.texts.filter((item) => sameCell(item.cell, cell) && Math.abs(start - item.start) < 0.35).length;
    // Just above the health bar, so the bar is never hidden.
    this.texts.push({
      cell, lift: tall + 12, start, life: 0.95, text, colour, size,
      dx: (this.random() - 0.5) * 14, dy: -recent * (size + 4),
    });
  }

  private flash(target: string, colour: string, start: number, life: number, strength: number): void {
    this.flashes.set(target, { colour, start, life: life * strength });
  }

  private sparks(cell: Cell, lift: number, colour: string, start: number, count: number): void {
    const n = this.calm ? Math.ceil(count / 2) : count;
    for (let i = 0; i < n; i += 1) {
      const angle = this.random() * Math.PI * 2;
      const speed = 90 + this.random() * 140;
      this.particles.push({
        cell, lift, start, life: 0.22 + this.random() * 0.18, x: 0, y: 0,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * 0.7 - 60,
        gravity: 520, size: 3, colour,
      });
    }
  }

  private shards(cell: Cell, lift: number, colour: string, start: number, count: number): void {
    const n = this.calm ? Math.ceil(count / 2) : count;
    for (let i = 0; i < n; i += 1) {
      const angle = this.random() * Math.PI * 2;
      const speed = 60 + this.random() * 150;
      this.particles.push({
        cell, lift, start, life: 0.55 + this.random() * 0.4, x: 0, y: 0,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * 0.6 - 120,
        gravity: 480, size: 4 + Math.floor(this.random() * 5),
        colour: i % 3 === 0 ? lighten(colour, 0.5) : colour,
      });
    }
  }

  private motes(cell: Cell, lift: number, colour: string, count: number, start: number, life = 0.9): void {
    const n = this.calm ? Math.ceil(count / 2) : count;
    for (let i = 0; i < n; i += 1) {
      this.particles.push({
        cell, lift, start: start + this.random() * 0.2, life: life * (0.6 + this.random() * 0.4),
        x: (this.random() - 0.5) * 36, y: (this.random() - 0.5) * 14,
        vx: (this.random() - 0.5) * 16, vy: -40 - this.random() * 50,
        gravity: 0, size: 3, colour,
      });
    }
  }

  private dust(cell: Cell, start: number): void {
    for (let i = 0; i < 3; i += 1) {
      this.particles.push({
        cell, lift: 2, start, life: 0.35, x: (this.random() - 0.5) * 16, y: 0,
        vx: (this.random() - 0.5) * 50, vy: -10 - this.random() * 12,
        gravity: 0, size: 4, colour: 'rgba(214, 196, 160, 0.55)',
      });
    }
  }

  private ring(cell: Cell, colour: string, start: number, life: number, from: number, to: number, width: number, lift = 0): void {
    this.rings.push({ cell, lift, colour, start, life, from, to, width });
  }

  private shake(amount: number): void {
    if (this.calm) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  private freeze(at: number, seconds: number): void {
    this.freezeUntil = Math.max(this.freezeUntil, at + seconds);
  }

  private fade(colour: string, start: number, life: number, peak: number): void {
    this.fades.push({ colour, start, life, peak: this.calm ? Math.min(peak, 0.4) : peak });
  }

  /* ------------------------------ time --------------------------------- */

  /** Advance: set off whatever is due, forget what is spent, let the shake
   *  settle. */
  update(now: number): void {
    const dt = this.lastUpdate ? Math.min(0.1, Math.max(0, now - this.lastUpdate)) : 0;
    this.lastUpdate = now;
    if (this.later.length) {
      const due = this.later.filter((item) => item.at <= now);
      this.later = this.later.filter((item) => item.at > now);
      for (const item of due) item.run();
    }
    const alive = <T extends { start: number; life: number }>(item: T) => now - item.start < item.life;
    this.texts = this.texts.filter(alive);
    this.particles = this.particles.filter(alive);
    this.rings = this.rings.filter(alive);
    this.fades = this.fades.filter(alive);
    this.shots = this.shots.filter((shot) => now < shot.arrive);
    for (const [id, flash] of this.flashes) if (now - flash.start >= flash.life) this.flashes.delete(id);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }

  /** How much of a frame's time the simulation should get: none during a
   *  hit-stop. The screen keeps moving; the fight holds its breath. */
  timeScale(now: number): number {
    return now < this.freezeUntil ? 0 : 1;
  }

  /** Where the camera is thrown this instant, in design units. */
  shakeAt(now: number): { x: number; y: number } {
    if (this.trauma <= 0) return { x: 0, y: 0 };
    const force = this.trauma * this.trauma * 9;
    // Two sines at odd rates per axis: smooth, and never quite repeating.
    return {
      x: force * (Math.sin(now * 47) * 0.6 + Math.sin(now * 71 + 1.3) * 0.4),
      y: force * (Math.sin(now * 53 + 2.1) * 0.6 + Math.sin(now * 83 + 0.4) * 0.4),
    };
  }

  /** How strongly a creature is lit up right now, and in what. */
  flashOf(entityId: string, now: number): { colour: string; strength: number } | null {
    const flash = this.flashes.get(entityId);
    if (!flash || now < flash.start) return null;
    const u = (now - flash.start) / flash.life;
    return u >= 1 ? null : { colour: flash.colour, strength: 1 - u };
  }

  /* ------------------------------ drawing ------------------------------ */

  /** Rings on the ground, sparks and shards, thrown blows. */
  drawWorld(ctx: CanvasRenderingContext2D, now: number, stage: Stage, halfWidth: number, halfHeight: number): void {
    for (const ring of this.rings) {
      if (now < ring.start) continue;
      const top = stage.locate(ring.cell);
      if (!top) continue;
      const u = (now - ring.start) / ring.life;
      const radius = ring.from + (ring.to - ring.from) * easeOut(u);
      ctx.save();
      ctx.globalAlpha = (1 - u) * 0.9;
      ctx.strokeStyle = ring.colour;
      ctx.lineWidth = ring.width;
      ctx.beginPath();
      ctx.ellipse(top.x, top.y - ring.lift, halfWidth * radius, halfHeight * radius, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const shot of this.shots) {
      const a = stage.feet(shot.from);
      const b = stage.feet(shot.to);
      const u = clamp((now - shot.start) / Math.max(0.01, shot.arrive - shot.start), 0, 1);
      ctx.save();
      ctx.shadowColor = shot.colour;
      ctx.shadowBlur = 16;
      for (let k = 4; k >= 0; k -= 1) {
        const t = Math.max(0, u - k * 0.06);
        const x = a.x + (b.x - a.x) * t;
        const y = a.y - shot.fromLift + (b.y - shot.toLift - (a.y - shot.fromLift)) * t - Math.sin(t * Math.PI) * 18;
        const size = k === 0 ? 10 : 8 - k;
        ctx.globalAlpha = k === 0 ? 1 : 0.5 - k * 0.1;
        ctx.fillStyle = k === 0 ? '#ffffff' : shot.colour;
        ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
      }
      ctx.restore();
    }

    for (const particle of this.particles) {
      if (now < particle.start) continue;
      const t = now - particle.start;
      const base = stage.feet(particle.cell);
      const x = base.x + particle.x + particle.vx * t;
      const y = base.y - particle.lift + particle.y + particle.vy * t + 0.5 * particle.gravity * t * t;
      ctx.globalAlpha = 1 - t / particle.life;
      ctx.fillStyle = particle.colour;
      ctx.fillRect(Math.round(x - particle.size / 2), Math.round(y - particle.size / 2), particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
  }

  /** The numbers: popped up, drifting up and fading, outlined like the HUD
   *  so they read over anything. */
  drawText(ctx: CanvasRenderingContext2D, now: number, stage: Stage): void {
    const { ink, font } = this.palette;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const item of this.texts) {
      if (now < item.start) continue;
      const u = (now - item.start) / item.life;
      const base = stage.feet(item.cell);
      const pop = u < 0.14 ? 1 + 0.6 * (1 - easeOutBack(u / 0.14)) : 1;
      const size = Math.round(item.size * pop);
      const x = Math.round(base.x + item.dx);
      const y = Math.round(base.y - item.lift + item.dy - easeOut(u) * 30);
      ctx.globalAlpha = u > 0.65 ? 1 - (u - 0.65) / 0.35 : 1;
      ctx.font = `${size}px ${font}`;
      ctx.fillStyle = ink;
      for (const [ox, oy] of OUTLINE) ctx.fillText(item.text, x + ox * 2, y + oy * 2);
      ctx.fillStyle = item.colour;
      ctx.fillText(item.text, x, y);
    }
    ctx.restore();
  }

  /** Whole-screen washes: the white of going down, the red of falling. */
  drawScreen(ctx: CanvasRenderingContext2D, now: number, width: number, height: number): void {
    for (const fade of this.fades) {
      if (now < fade.start) continue;
      const u = (now - fade.start) / fade.life;
      ctx.globalAlpha = fade.peak * (1 - u) * (1 - u);
      ctx.fillStyle = fade.colour;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.globalAlpha = 1;
  }
}

/* ------------------------------ helpers ---------------------------------- */

/** Where a cue happened, if it happened somewhere. */
function cellOf(item: Cue): Cell | null {
  if ('cell' in item) return item.cell;
  if (item.type === 'burst') return item.center;
  if (item.type === 'mark') return item.cells[0] ?? null;
  return null;
}

const OUTLINE: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]];

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const sameCell = (a: Cell, b: Cell): boolean => a.row === b.row && a.col === b.col;
const easeOut = (u: number): number => 1 - (1 - clamp(u, 0, 1)) ** 3;

function easeOutBack(u: number): number {
  const c = 1.70158;
  const v = clamp(u, 0, 1) - 1;
  return 1 + (c + 1) * v ** 3 + c * v ** 2;
}

/** Mix a #rrggbb or rgb() colour towards white. */
function lighten(colour: string, amount: number): string {
  const rgb = parseColour(colour);
  if (!rgb) return colour;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(rgb[0])}, ${mix(rgb[1])}, ${mix(rgb[2])})`;
}

function parseColour(colour: string): [number, number, number] | null {
  if (colour.startsWith('#') && colour.length === 7) {
    const value = Number.parseInt(colour.slice(1), 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  }
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(colour);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}
