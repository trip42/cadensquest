/* Juice: what the game does to your eyes and ears when something happens.

   The rules push cues (game/cues.ts); this takes the new ones each frame
   and turns them into sound — and works out when each blow *lands*, which
   is not when the rules resolve it. The rules deal damage the moment a card
   is played or an enemy acts, as the attacker starts its swing; the thud
   belongs a beat later, at contact, or when a thrown thing arrives.
   Everything a blow sets off is timed from that. */

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

/** What the juice needs from whoever draws the map. */
export interface Stage {
  /** Where a tile's surface is, in design units, or null if it is not
   *  there — used to place a sound left or right. */
  locate(cell: Cell): { x: number; y: number } | null;
  /** The visible width, in the same units. */
  width: number;
}

export class Juice {
  /** The last cue handled. */
  private seen: number;
  /** When each creature's latest blow lands, in seconds — so the creature
   *  falls when the blow that killed it lands, not before. */
  private readonly lands = new Map<string, number>();

  constructor(
    private readonly game: Game,
    private readonly sound: Pick<SoundPlayer, 'play'> = sfx,
  ) {
    // Only what happens from now on: a map built part-way through a run
    // does not replay the cues that came before it.
    this.seen = game.state.cueSeq;
  }

  /** Take whatever has been cued since the last frame. `now` in seconds. */
  take(now: number, stage: Stage): void {
    const { state } = this.game;
    if (state.cueSeq === this.seen) return;
    for (const item of cuesSince(state, this.seen)) this.handle(item, now, stage);
    this.seen = state.cueSeq;
  }

  private handle(item: SeqCue, now: number, stage: Stage): void {
    const impact = this.impactOf(item, now);
    const where = cellOf(item);
    const point = where ? stage.locate(where) : null;
    const pan = point && stage.width ? clamp((point.x - stage.width / 2) / (stage.width / 2), -1, 1) * 0.6 : 0;
    const mine = 'target' in item && item.target === this.game.state.playerId;
    for (const { name, ...options } of soundsFor(item, { impact, mine })) {
      this.sound.play(name, { ...options, pan });
    }
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
}

/** Where a cue happened, if it happened somewhere. */
function cellOf(item: Cue): Cell | null {
  if ('cell' in item) return item.cell;
  if (item.type === 'burst') return item.center;
  if (item.type === 'mark') return item.cells[0] ?? null;
  return null;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
