/* What just happened, for the screen and the speakers.

   The rules push a cue at the moment something happens — a blow lands, a
   creature falls, a portal opens — and know nothing about who is
   listening. The renderer turns cues into numbers, flashes, shake and
   sparks; the sound player turns them into sound. It is the same idea as
   telemetry, but for the next few frames rather than for analytics, so
   only the recent ones are kept.

   Each cue gets a rising `seq`. A listener remembers the last one it
   handled and takes whatever is newer each frame, so any number of
   listeners read the same feed and none of them drains it. A cue carries
   everything its listeners need — cells as well as ids — because by the
   time it is shown, the creature it names may already be gone. */

import type { Faction } from './entities/types';
import type { Cell } from './map/navigation';

/** How damage arrived: a blow from a creature or card, a marked tile, or
 *  an area burst. */
export type HitVia = 'blow' | 'tile' | 'burst';

export type Cue =
  /** Damage landing. `amount` is the health it cost, `blocked` what block
   *  soaked up; either may be 0. `from` is where the attacker stood, and
   *  `ranged` whether the blow crossed more than one tile. */
  | {
    type: 'hit'; target: string; side: Faction; cell: Cell;
    amount: number; blocked: number; fatal: boolean; via: HitVia;
    by?: string; from?: Cell; ranged?: boolean;
  }
  /** Block, health or power actually gained — nothing is cued for a heal
   *  at full health. */
  | { type: 'gain'; target: string; side: Faction; cell: Cell; stat: 'block' | 'heal' | 'power'; amount: number }
  /** A creature dying — or, for a summon whose rounds ran out, fading. */
  | { type: 'fall'; target: string; side: Faction; cell: Cell; guardian: boolean; faded: boolean }
  | { type: 'tame'; target: string; cell: Cell }
  | { type: 'summon'; target: string; side: Faction; cell: Cell }
  /** Tiles marked with terrain, in the mark's colour. */
  | { type: 'mark'; cells: Cell[]; colour: string }
  /** An area burst going off: every tile it covered. */
  | { type: 'burst'; center: Cell; cells: Cell[]; colour: string }
  /** The player played a card. */
  | { type: 'play'; card: string; attack: boolean; ranged: boolean }
  /** Cards traded in for movement. */
  | { type: 'discard'; count: number }
  /** A step finished: someone arrived on a tile. */
  | { type: 'step'; target: string; side: Faction; cell: Cell }
  | { type: 'portal'; cell: Cell; way: 'down' | 'out' }
  /** Arrived on a new floor. */
  | { type: 'descend'; floor: number }
  /** The player's phase begins. */
  | { type: 'turn'; turn: number }
  /** A won reward comes up to be chosen, and what was done with it. */
  | { type: 'reward'; kind: 'card' | 'gem' | 'talisman' }
  | { type: 'claim'; kind: 'card' | 'gem' | 'talisman' | 'skip' }
  | { type: 'end'; outcome: 'won' | 'died' };

export type CueType = Cue['type'];
export type SeqCue = Cue & { seq: number };

/** How many recent cues are kept. A listener only ever needs the ones since
 *  its last frame; this is room for a busy frame, such as a burst that
 *  catches a crowd. */
export const MAX_CUES = 64;

/** The slice of state this module needs; avoids importing state.ts back. */
export interface CueFeed {
  cues: SeqCue[];
  cueSeq: number;
}

export function cue(feed: CueFeed, event: Cue): void {
  feed.cueSeq += 1;
  feed.cues.push({ ...event, seq: feed.cueSeq });
  if (feed.cues.length > MAX_CUES) feed.cues.splice(0, feed.cues.length - MAX_CUES);
}

/** The cues after `seq`, oldest first. */
export const cuesSince = (feed: CueFeed, seq: number): SeqCue[] =>
  feed.cues.filter((item) => item.seq > seq);
