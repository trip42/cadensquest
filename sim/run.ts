/* One run, played by the bot and watched: everything the fun measures need,
   recorded as it happens. */

import { beginTurn } from '../app/game/actions';
import type { SeqCue } from '../app/game/cues';
import { createGame, enemies, type Game, player, resetUids, syncStats } from '../app/game/state';
import { playTurn } from './bot';

export type KillWay = 'blow' | 'tile' | 'burst' | 'slam' | 'later' | 'other';

export interface RunRecord {
  seed: number;
  outcome: 'won' | 'died' | 'stuck';
  /** The floor the run ended on, from 0. */
  floor: number;
  turns: number;
  turnsOnFloor: number[];
  /** Health, as a share of the maximum, arriving on each floor. */
  healthOnArrival: number[];
  /** The lowest health got, as a share of the maximum. */
  lowest: number;
  /** Health lost in each enemy phase, as a share of the maximum. */
  phaseLoss: number[];
  /** Card-play decisions: how many, and how many had a real alternative, or
   *  only one thing worth doing, or nothing worth doing. */
  decisions: number;
  choices: number;
  obvious: number;
  empty: number;
  /** Turns begun with an enemy within 4 tiles, or with none within 8. */
  engaged: number;
  quiet: number;
  /** The most enemies within 3 tiles at the start of any turn. */
  crowd: number;
  kills: Record<KillWay, number>;
  played: Record<string, number>;
  discarded: Record<string, number>;
  picked: Record<string, number>;
  skipped: number;
  shoves: number;
  allies: number;
  deck: number;
  talismans: string[];
  /** Coins picked up and spent, and what was bought (by item). */
  coinsEarned: number;
  coinsSpent: number;
  bought: Record<string, number>;
}

/* The cue feed keeps only the recent cues, and one enemy phase can push
   more than that; the recorder listens to every push as it happens. The
   copies the bot makes to try things are plain arrays and stay silent. */
// The listener lives beside the array, not on it: structuredClone copies an
// array's own properties, and cannot copy a function.
const listeners = new WeakMap<object, (item: SeqCue) => void>();

class Tap extends Array<SeqCue> {
  static get [Symbol.species]() {
    return Array;
  }

  override push(...items: SeqCue[]): number {
    const listener = listeners.get(this);
    if (listener) for (const item of items) listener(item);
    return super.push(...items);
  }
}

function tapCues(game: Game, listener: (item: SeqCue) => void): void {
  const tap = new Tap();
  tap.push(...game.state.cues);
  listeners.set(tap, listener);
  game.state.cues = tap;
}

/** Enough turns for any run that is going somewhere. */
const MAX_TURNS = 400;

export function playRun(seed: number, talismans: string[] = []): RunRecord {
  resetUids();
  const game = createGame(seed);
  const { state } = game;
  for (const id of talismans) state.talismans.push(id);
  syncStats(state);
  beginTurn(game);

  const record: RunRecord = {
    seed, outcome: 'stuck', floor: 0, turns: 0, turnsOnFloor: [0], healthOnArrival: [1], lowest: 1, phaseLoss: [],
    decisions: 0, choices: 0, obvious: 0, empty: 0, engaged: 0, quiet: 0, crowd: 0,
    kills: { blow: 0, tile: 0, burst: 0, slam: 0, later: 0, other: 0 }, played: {}, discarded: {}, picked: {}, skipped: 0,
    shoves: 0, allies: 0, deck: 0, talismans: [], coinsEarned: 0, coinsSpent: 0, bought: {},
  };

  // Kills are credited to however the killing blow arrived.
  const lastHit = new Map<string, KillWay>();
  tapCues(game, (item) => {
    if (item.type === 'hit' && item.side === 'enemy') lastHit.set(item.target, item.via);
    if (item.type === 'fall' && item.side === 'enemy' && !item.faded) record.kills[lastHit.get(item.target) ?? 'other'] += 1;
    if (item.type === 'shove') record.shoves += 1;
    if (item.type === 'tame' || (item.type === 'summon' && item.side === 'ally')) record.allies += 1;
  });

  const random = mulberry(seed * 7919 + 17);
  const self = () => player(state);
  let before = self().hp;

  while (state.phase === 'player' && state.turn < MAX_TURNS) {
    const me = self();
    const here = { row: me.row, col: me.col };
    const distances = enemies(state).map((enemy) => Math.abs(enemy.row - here.row) + Math.abs(enemy.col - here.col));
    if (distances.some((d) => d <= 4)) record.engaged += 1;
    if (!distances.some((d) => d <= 8)) record.quiet += 1;
    record.crowd = Math.max(record.crowd, distances.filter((d) => d <= 3).length);

    const floor = state.floor;
    playTurn(game, random, {
      decided: (decision) => {
        if (!decision.options) return;
        record.decisions += 1;
        if (decision.close >= 2) record.choices += 1;
        if (decision.positive === 1) record.obvious += 1;
        if (decision.positive === 0) record.empty += 1;
      },
      beforeEnemies: () => {
        before = self().hp;
      },
    });

    const after = self();
    record.phaseLoss.push(Math.max(0, before - after.hp) / after.maxHp);
    record.lowest = Math.min(record.lowest, after.hp / after.maxHp);
    record.turnsOnFloor[record.turnsOnFloor.length - 1]! += 1;
    if (state.floor !== floor) {
      record.turnsOnFloor.push(0);
      record.healthOnArrival.push(after.hp / after.maxHp);
    }
  }

  record.outcome = state.phase === 'victory' ? 'won' : state.phase === 'defeat' ? 'died' : 'stuck';
  record.floor = state.floor;
  record.turns = state.turn;
  record.played = { ...state.tally.cardsPlayed };
  record.discarded = { ...state.tally.cardsDiscarded };
  record.picked = { ...state.tally.cardsCollected };
  record.skipped = Object.values(state.tally.rewardsSkipped).reduce((a, b) => a + b, 0);
  record.deck = state.drawPile.length + state.hand.length + state.discardPile.length;
  record.talismans = state.talismans.filter((id) => !talismans.includes(id));
  record.coinsEarned = state.tally.coinsEarned;
  record.coinsSpent = state.tally.coinsSpent;
  record.bought = { ...state.tally.bought };
  return record;
}

/** Mulberry32 — the bot's own dice, apart from the game's. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
