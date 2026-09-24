/* Rules text written from a card's effects, for the content editor's
   "Write it from the effects". Plain sentences in the house style — "Deal 6
   damage to an adjacent enemy.", "Closes up to 3 and bites for 3." — as a
   starting point the designer can reword. The game never reads this; it
   shows whatever `text` says. */

import type { EffectData } from '~/game/content';
import { type Amount, describeAmount, isScaled } from '~/game/effects';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "all your block" reads better than "block equal to your block". */
const isAllOf = (amount: Amount, of: string) =>
  isScaled(amount) && amount.of === of && (amount.times ?? 1) === 1 && !amount.plus;

function playerPhrase(effect: EffectData, range: number): string {
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

export function writeCardText(effects: EffectData[], range: number, side: 'player' | 'enemy'): string {
  return sentence(effects.map((effect) => (side === 'player' ? playerPhrase : enemyPhrase)(effect, range)));
}

/** A gem's effect happens on top of a card, so it reads as a rider. */
export function writeGemText(effects: EffectData[]): string {
  const text = sentence(effects.map((effect) => playerPhrase(effect, 1)));
  return text ? `${text.slice(0, -1)} when this card is played.` : '';
}
