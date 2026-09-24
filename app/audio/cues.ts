/* Which sounds each cue makes — the sound design, apart from the sounds
   themselves. Pure: a cue in, a list of sounds out, each with its delay,
   level and pitch. The renderer calls it as cues arrive, with how long a
   blow takes to land (the same delay the screen uses, so the thud and the
   flash arrive together), and adds where on screen it happened as pan. */

import type { Cue } from '../game/cues';
import type { PlayOptions } from './player';
import type { SoundName } from './sounds';

export interface SoundCall extends PlayOptions {
  name: SoundName;
}

export interface CueTiming {
  /** Seconds from the cue until its blow lands on screen: a swing's contact,
   *  or a projectile's flight. 0 for anything that lands at once. */
  impact: number;
  /** Is the creature it concerns the player's? Steps and falls are quieter
   *  for everyone else. */
  mine?: boolean;
}

/** How many card flicks a big discard makes, at most. */
const MAX_FLICKS = 5;

export function soundsFor(item: Cue, timing: CueTiming = { impact: 0 }): SoundCall[] {
  const { impact } = timing;
  switch (item.type) {
    case 'hit': {
      const calls: SoundCall[] = [];
      // The attacker's side is the other one: a blow on an enemy came from
      // the player or an ally.
      if (item.via === 'blow') {
        if (item.ranged) calls.push({ name: item.side === 'enemy' ? 'zap' : 'hurl', volume: 0.7 });
        else calls.push({ name: 'swing', volume: 0.55 });
      }
      if (item.via === 'tile') calls.push({ name: 'sizzle', volume: 0.7 });
      if (item.amount > 0) {
        const heavy = item.fatal || item.amount >= 10;
        const name: SoundName = item.side === 'player' ? 'hurt' : heavy ? 'smash' : 'hit';
        calls.push({ name, delay: impact, vary: 0.08 });
      }
      if (item.blocked > 0) calls.push({ name: 'clank', delay: impact, volume: item.amount > 0 ? 0.5 : 0.9 });
      return calls;
    }
    case 'fall': {
      if (item.faded) return [{ name: 'summon', rate: 0.7, volume: 0.4, delay: impact }];
      if (item.side === 'player') return [{ name: 'fall', delay: impact }];
      if (item.side === 'ally') return [{ name: 'fall', rate: 1.5, volume: 0.5, delay: impact }];
      const calls: SoundCall[] = [{ name: 'shatter', delay: impact, vary: 0.1 }];
      if (item.guardian) calls.push({ name: 'boom', delay: impact, volume: 0.8 });
      return calls;
    }
    case 'gain':
      if (item.stat === 'block') return [{ name: 'guard', volume: 0.8 }];
      if (item.stat === 'heal') return [{ name: 'heal', volume: 0.8 }];
      return [{ name: 'power', volume: 0.8 }];
    case 'tame':
      return [{ name: 'tame' }];
    case 'summon':
      // An enemy's summons arrive a little lower and darker.
      return [{ name: 'summon', rate: item.side === 'enemy' ? 0.8 : 1 }];
    case 'mark':
      return [{ name: 'mark' }];
    case 'burst':
      return [{ name: 'boom', volume: 0.9 }];
    case 'play':
      return [{ name: 'card', volume: 0.6 }];
    case 'discard':
      return [
        { name: 'discard', volume: 0.8 },
        ...Array.from({ length: Math.min(item.count, MAX_FLICKS) }, (_, i): SoundCall => ({
          name: 'card', delay: 0.03 + i * 0.045, rate: 0.9, volume: 0.45, vary: 0.12,
        })),
      ];
    case 'step':
      return [{ name: 'step', volume: timing.mine ? 0.5 : 0.18, vary: 0.15, rate: item.side === 'enemy' ? 0.8 : 1 }];
    case 'portal':
      return [{ name: 'portal' }];
    case 'descend':
      return [{ name: 'descend' }];
    case 'turn':
      return [{ name: 'turn', vary: 0 }];
    case 'reward':
      return [{ name: 'reward', vary: 0 }];
    case 'claim':
      if (item.kind === 'skip') return [{ name: 'click' }];
      return [{ name: 'pickup', vary: 0, rate: item.kind === 'gem' ? 1.12 : item.kind === 'talisman' ? 0.84 : 1 }];
    case 'end':
      // After the fall has sounded.
      return [{ name: item.outcome === 'won' ? 'victory' : 'defeat', delay: item.outcome === 'won' ? 0.2 : 0.9, vary: 0 }];
  }
}

const at = { row: 0, col: 0 };

/** One of each kind of cue, with a word on each: what the sound board lists
 *  under the sounds it makes, and what the tests play through. */
export const EXAMPLE_CUES: Array<{ label: string; cue: Cue }> = [
  { label: 'a blow on an enemy', cue: { type: 'hit', target: 'a', side: 'enemy', cell: at, amount: 6, blocked: 0, fatal: false, via: 'blow' } },
  { label: 'a heavy blow', cue: { type: 'hit', target: 'a', side: 'enemy', cell: at, amount: 12, blocked: 0, fatal: false, via: 'blow' } },
  { label: 'a spit or breath on Caden, partly blocked', cue: { type: 'hit', target: 'a', side: 'player', cell: at, amount: 3, blocked: 2, fatal: false, via: 'blow', ranged: true } },
  { label: 'a blast from Caden', cue: { type: 'hit', target: 'a', side: 'enemy', cell: at, amount: 4, blocked: 0, fatal: false, via: 'blow', ranged: true } },
  { label: 'a burst, all blocked', cue: { type: 'hit', target: 'a', side: 'enemy', cell: at, amount: 0, blocked: 5, fatal: false, via: 'burst' } },
  { label: 'a burning tile', cue: { type: 'hit', target: 'a', side: 'ally', cell: at, amount: 3, blocked: 0, fatal: false, via: 'tile' } },
  { label: 'gaining block', cue: { type: 'gain', target: 'a', side: 'player', cell: at, stat: 'block', amount: 5 } },
  { label: 'healing', cue: { type: 'gain', target: 'a', side: 'player', cell: at, stat: 'heal', amount: 5 } },
  { label: 'growing stronger', cue: { type: 'gain', target: 'a', side: 'enemy', cell: at, stat: 'power', amount: 1 } },
  { label: 'an enemy falling', cue: { type: 'fall', target: 'a', side: 'enemy', cell: at, guardian: false, faded: false } },
  { label: 'a guardian falling', cue: { type: 'fall', target: 'a', side: 'enemy', cell: at, guardian: true, faded: false } },
  { label: 'an ally falling', cue: { type: 'fall', target: 'a', side: 'ally', cell: at, guardian: false, faded: false } },
  { label: 'a summon fading', cue: { type: 'fall', target: 'a', side: 'ally', cell: at, guardian: false, faded: true } },
  { label: 'Caden falling', cue: { type: 'fall', target: 'a', side: 'player', cell: at, guardian: false, faded: false } },
  { label: 'taming', cue: { type: 'tame', target: 'a', cell: at } },
  { label: 'summoning', cue: { type: 'summon', target: 'a', side: 'enemy', cell: at } },
  { label: 'marking a tile', cue: { type: 'mark', cells: [at], colour: '#e43b44' } },
  { label: 'an area burst', cue: { type: 'burst', center: at, cells: [at], colour: '#feae34' } },
  { label: 'playing a card', cue: { type: 'play', card: 'strike', attack: true, ranged: false } },
  { label: 'discarding cards', cue: { type: 'discard', count: 4 } },
  { label: 'a footstep', cue: { type: 'step', target: 'a', side: 'player', cell: at } },
  { label: 'a portal opening', cue: { type: 'portal', cell: at, way: 'down' } },
  { label: 'going down a floor', cue: { type: 'descend', floor: 1 } },
  { label: 'your turn', cue: { type: 'turn', turn: 2 } },
  { label: 'a reward coming up', cue: { type: 'reward', kind: 'gem' } },
  { label: 'taking a card', cue: { type: 'claim', kind: 'card' } },
  { label: 'setting a gem', cue: { type: 'claim', kind: 'gem' } },
  { label: 'taking a talisman', cue: { type: 'claim', kind: 'talisman' } },
  { label: 'leaving a reward', cue: { type: 'claim', kind: 'skip' } },
  { label: 'winning', cue: { type: 'end', outcome: 'won' } },
  { label: 'game over', cue: { type: 'end', outcome: 'died' } },
];

/** Sounds the interface plays itself, not from a cue. */
export const INTERFACE_SOUNDS: Partial<Record<SoundName, string>> = {
  card: 'picking up, putting down and dealing cards',
  deny: 'a click that can do nothing',
  click: 'END PHASE, and turning sound on',
};
