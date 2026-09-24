/* Rules text written from a card's effects, for the content editor's
   "Write it from the effects". Plain sentences in the house style — "Deal 6
   damage to an adjacent enemy.", "Closes up to 3 and bites for 3." — as a
   starting point the designer can reword. The game never reads this; it
   shows whatever `text` says. */

import type { EffectData } from '~/game/content';
import type { Targeting } from '~/game/cards/types';

type SimpleData = Exclude<EffectData, { kind: 'terrain' }>;
type TerrainData = Extract<EffectData, { kind: 'terrain' }>;
import { type Amount, describeAmount, isScaled } from '~/game/effects';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "all your block" reads better than "block equal to your block". */
const isAllOf = (amount: Amount, of: string) =>
  isScaled(amount) && amount.of === of && (amount.times ?? 1) === 1 && !amount.plus;

/** What a marked tile does, said of whoever is on it: "takes 3 damage and
 *  gains 2 block". */
function tilePhrase(tiles: TerrainData['effects'], owner: string): string {
  return tiles.map((tile) => {
    const n = describeAmount(tile.amount as Amount, owner);
    switch (tile.kind) {
      case 'damage': return `takes ${n} damage`;
      case 'block': return `gains ${n} block`;
      case 'loseBlock': return `loses ${n} block`;
      case 'heal': return `heals ${n}`;
      case 'power': return `gains ${n} power`;
      case 'energy': return `gains ${n} energy`;
      case 'draw': return `draws ${n}`;
      case 'movement': return `gains ${n} movement`;
      default: return `${tile.kind} ${n}`;
    }
  }).join(' and ');
}

/** "for 3 rounds", "for X rounds", "for 1 round". */
function roundsPhrase(effect: TerrainData): string {
  const n = describeAmount(effect.rounds as Amount);
  return `for ${n} round${n === '1' ? '' : 's'}`;
}

/** Which tile a card marks, from how it targets. */
function wherePhrase(targeting: Targeting | undefined, range: number): string {
  if (targeting === 'enemy') return range <= 1 ? "an adjacent enemy's tile" : `an enemy's tile within ${range}`;
  if (targeting === 'cell') return range <= 1 ? 'an adjacent tile' : `a tile within ${range}`;
  return 'your tile';
}

/* Tame and Mend are about a particular creature, so they read from the
   targeting: "tame an enemy within 2 with 8 health or less", then "heal it
   5" for the one just tamed, or "heal an ally within 3 5" on its own. */
function creaturePhrase(effect: SimpleData, range: number, targeting: Targeting | undefined, afterTame: boolean): string {
  const n = describeAmount(effect.amount as Amount);
  const within = (who: string) => (range <= 1 ? `an adjacent ${who}` : `an ${who} within ${range}`);
  if (effect.kind === 'tame') return `tame ${within('enemy')} with ${n} health or less`;
  const whom = afterTame ? 'it' : targeting === 'ally' ? within('ally') : 'the target';
  if (isScaled(effect.amount as Amount)) return `heal ${whom} equal to ${n}`;
  return afterTame ? `heal it ${n}` : `heal ${whom} for ${n}`;
}

function playerPhrase(effect: EffectData, range: number, targeting?: Targeting, afterTame = false): string {
  if (effect.kind === 'tame' || effect.kind === 'mend') return creaturePhrase(effect, range, targeting, afterTame);
  if (effect.kind === 'terrain') {
    return `mark ${wherePhrase(targeting, range)}: ${roundsPhrase(effect)}, whoever is on it ${tilePhrase(effect.effects, 'your')}`;
  }
  return simplePlayerPhrase(effect, range);
}

function simplePlayerPhrase(effect: SimpleData, range: number): string {
  const amount = effect.amount as Amount;
  const target = range <= 1 ? 'an adjacent enemy' : `an enemy within ${range}`;
  // X reads like a number, the way cards print it: "Deal X damage".
  if (isScaled(amount) && amount.of === 'x') {
    const n = describeAmount(amount);
    switch (effect.kind) {
      case 'damage': return `deal ${n} damage to ${target}`;
      case 'block': return `gain ${n} block`;
      case 'loseBlock': return `lose ${n} block`;
      case 'heal': return `heal ${n}`;
      case 'power': return `deal ${n} more damage for the rest of the run`;
      case 'movement': return `gain ${n} steps`;
      case 'energy': return `gain ${n} energy`;
      case 'draw': return `draw ${n} cards`;
      case 'step': return `leap to a cell within ${range}`;
      default: return `${effect.kind} ${n}`;
    }
  }
  if (isScaled(amount)) {
    const n = describeAmount(amount, 'your');
    switch (effect.kind) {
      case 'damage': return `deal damage equal to ${n} to ${target}`;
      case 'block': return `gain block equal to ${n}`;
      case 'loseBlock': return isAllOf(amount, 'block') ? 'lose all your block' : `lose block equal to ${n}`;
      case 'heal': return `heal equal to ${n}`;
      case 'power': return `deal extra damage equal to ${n} for the rest of the run`;
      case 'movement': return `gain steps equal to ${n}`;
      case 'energy': return `gain energy equal to ${n}`;
      case 'draw': return `draw cards equal to ${n}`;
      case 'step': return `leap to a cell within ${range}`;
      default: return `${effect.kind} ${n}`;
    }
  }
  const n = amount;
  switch (effect.kind) {
    case 'damage': return `deal ${n} damage to ${target}`;
    case 'block': return `gain ${n} block`;
    case 'loseBlock': return `lose ${n} block`;
    case 'heal': return `heal ${n}`;
    case 'power': return `deal ${n} more damage for the rest of the run`;
    case 'movement': return `gain ${plural(n, 'step')}`;
    case 'energy': return `gain ${n} energy`;
    case 'draw': return n === 1 ? 'draw a card' : `draw ${n} cards`;
    case 'step': return `leap to a cell within ${range}`;
    default: return `${effect.kind} ${n}`;
  }
}

function enemyPhrase(effect: EffectData, range: number): string {
  if (effect.kind === 'terrain') {
    // Neutral, not "your tile": a tamed creature plays this card too.
    return `marks its target's tile ${roundsPhrase(effect)}: whoever is on it ${tilePhrase(effect.effects, 'its')}`;
  }
  const amount = effect.amount as Amount;
  const n = describeAmount(amount, 'its');
  const scaled = isScaled(amount);
  switch (effect.kind) {
    case 'advance': return `closes up to ${n}`;
    case 'damage': {
      const hit = scaled ? `hits for ${n}` : range <= 1 ? `bites for ${n}` : `hits for ${n}`;
      return range <= 1 ? hit : `${hit} from up to ${range} away`;
    }
    case 'block': return scaled ? `gains block equal to ${n}` : `gains ${n} block`;
    case 'loseBlock': return isAllOf(amount, 'block') ? 'drops its guard' : scaled ? `loses block equal to ${n}` : `loses ${n} block`;
    case 'heal': return scaled ? `heals equal to ${n}` : `heals ${n}`;
    case 'power': return scaled ? `grows stronger by ${n}` : `grows ${n} stronger`;
    default: return `${effect.kind} ${n}`;
  }
}

function sentence(phrases: string[]): string {
  if (!phrases.length) return '';
  const joined = phrases.length === 1
    ? phrases[0]!
    : `${phrases.slice(0, -1).join(', ')} and ${phrases.at(-1)}`;
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}

export function writeCardText(effects: EffectData[], range: number, side: 'player' | 'enemy', targeting?: Targeting): string {
  return sentence(effects.map((effect, i) => side === 'player'
    ? playerPhrase(effect, range, targeting, effects.slice(0, i).some((earlier) => earlier.kind === 'tame'))
    : enemyPhrase(effect, range)));
}

/** A gem's effect happens on top of a card, so it reads as a rider. */
export function writeGemText(effects: EffectData[]): string {
  const text = sentence(effects.map((effect) => playerPhrase(effect, 1, 'enemy')));
  return text ? `${text.slice(0, -1)} when this card is played.` : '';
}
