/* Rules text written from a card's effects, for the content editor's
   "Write it from the effects". Plain sentences in the house style — "Deal 6
   damage to an adjacent enemy.", "Closes up to 3 and bites for 3." — as a
   starting point the designer can reword. The game never reads this; it
   shows whatever `text` says. */

import type { EffectData } from '~/game/content';
import type { Targeting } from '~/game/cards/types';

type SimpleData = Exclude<EffectData, { kind: 'terrain' } | { kind: 'summon' } | { kind: 'area' } | { kind: 'later' } | { kind: 'boon' }>;
type BoonData = Extract<EffectData, { kind: 'boon' }>;

/* What a boon does, said to the player: "for 2 rounds, every fire deals 2
   more damage". The stats cards raise most have their own wording; the rest
   read as the stat table names them. */
function boonPhrase(effect: BoonData): string {
  const rounds = describeAmount(effect.rounds as Amount);
  const add = effect.add === undefined ? null : describeAmount(effect.add as Amount, 'your');
  const scaled = effect.add !== undefined && isScaled(effect.add as Amount);
  const times = effect.mul === 2 ? 'double' : effect.mul === 3 ? 'triple' : `${effect.mul}×`;
  const what: string[] = [];
  switch (effect.stat) {
    case 'fireDamage':
      if (add) what.push(scaled ? `every fire deals extra damage equal to ${add}` : `every fire deals ${add} more damage`);
      if (effect.mul) what.push(`every fire's damage is multiplied by ${effect.mul}`);
      break;
    case 'fireMultiplier':
      if (effect.mul) what.push(`every fire deals ${times} damage`);
      break;
    case 'slamDamage':
      if (add) what.push(`knockback slams deal ${add} more`);
      if (effect.mul) what.push(effect.mul === 2 ? 'knockback slams hit twice as hard' : `knockback slams deal ${times} damage`);
      break;
    default:
      if (add) what.push(`gain ${add} ${STAT_NAMES[effect.stat]}`);
      if (effect.mul) what.push(`your ${STAT_NAMES[effect.stat]} is ×${effect.mul}`);
  }
  return `for ${rounds} round${rounds === '1' ? '' : 's'}, ${what.join(' and ')}`;
}
type LaterData = Extract<EffectData, { kind: 'later' }>;
type AreaData = Extract<EffectData, { kind: 'area' }>;

/** Who a burst catches, and the verb that goes with them. "everyone within
 *  1 takes", "every foe within 1 takes", "whoever is there takes". */
function caughtPhrase(effect: AreaData, owner: string): string {
  const reach = effect.radius === 0 ? '' : ` within ${effect.radius}`;
  const who = effect.affects === 'foes'
    ? `every foe${reach || ' there'}`
    : effect.affects === 'friends'
      ? `each of ${owner} side${reach || ' there'}`
      : effect.radius === 0 ? 'whoever is there' : `everyone${reach}`;
  return `${who} ${tilePhrase(effect.effects, owner)}`;
}
type SummonData = Extract<EffectData, { kind: 'summon' }>;

/** A creature's name for the text, from its id when no better name is known. */
export type NameOf = (id: string) => string;
const byId: NameOf = (id) => id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** "a Wolf", "an Owl". */
const article = (name: string) => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;

/** "a Wolf with 10 health for 3 rounds". */
function summonedPhrase(effect: SummonData, nameOf: NameOf, where = ''): string {
  const health = describeAmount(effect.amount as Amount);
  const rounds = effect.rounds === undefined ? '' : ` for ${describeAmount(effect.rounds as Amount)} round${describeAmount(effect.rounds as Amount) === '1' ? '' : 's'}`;
  return `${article(nameOf(effect.entity))}${where} with ${health} health${rounds}`;
}
type TerrainData = Extract<EffectData, { kind: 'terrain' }>;
import { type Amount, describeAmount, isScaled } from '~/game/effects';
import { STAT_NAMES } from '~/game/stats';

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
      case 'losePower': return isAllOf(tile.amount as Amount, 'power') ? `loses all ${owner} power` : `loses ${n} power`;
      case 'energy': return `gains ${n} energy`;
      case 'draw': return `draws ${n}`;
      case 'movement': return `gains ${n} movement`;
      default: return `${tile.kind} ${n}`;
    }
  }).join(' and ');
}

/* What a mark does, in all its parts: to whoever is on it, as it arrives,
   as it leaves. Power on entering taken back on leaving reads as what it
   is: "whoever stands on it deals 1 more damage". */
function markPhrase(effect: TerrainData, owner: string): string {
  const { enter = [], exit = [] } = effect;
  const [gain] = enter;
  const [loss] = exit;
  const standing = enter.length === 1 && exit.length === 1 && gain!.kind === 'power' && loss!.kind === 'losePower'
    && JSON.stringify(gain!.amount) === JSON.stringify(loss!.amount);
  const parts = [
    effect.effects.length ? `whoever is on it ${tilePhrase(effect.effects, owner)}` : '',
    standing
      ? `whoever stands on it deals ${describeAmount(gain!.amount as Amount, owner)} more damage`
      : [
        enter.length ? `whoever arrives ${tilePhrase(enter, owner)}` : '',
        exit.length ? `whoever leaves ${tilePhrase(exit, owner)}` : '',
      ].filter(Boolean).join(' and '),
  ].filter(Boolean);
  return parts.join(' and ');
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

/* Knockback and pull move the creature the card is aimed at; once a card
   has named it — hit it, tamed it, moved it — later effects say "it". */
const NAMES_TARGET = new Set(['damage', 'tame', 'push', 'pull']);

function movePhrase(effect: SimpleData, range: number, mentioned: boolean): string {
  const n = describeAmount(effect.amount as Amount, 'your');
  const scaled = isScaled(effect.amount as Amount) && (effect.amount as { of: string }).of !== 'x';
  const who = mentioned ? 'it' : range <= 1 ? 'an adjacent enemy' : `an enemy within ${range}`;
  if (effect.kind === 'push') return scaled ? `knock ${who} back tiles equal to ${n}` : `knock ${who} back ${n}`;
  return scaled ? `pull ${who} closer by ${n}` : `pull ${who} up to ${n} closer`;
}

/** "in 2 rounds", "in X rounds", "next round". */
function whenPhrase(rounds: Amount): string {
  const n = describeAmount(rounds);
  return n === '1' ? 'next round' : `in ${n} rounds`;
}

/** What a Later does, said to the player: "in 2 rounds, lose 2 power". */
function laterPhrase(effect: LaterData): string {
  const what = effect.effects.map((inner) => {
    const n = describeAmount(inner.amount as Amount, 'your');
    switch (inner.kind) {
      case 'damage': return `take ${n} damage`;
      case 'block': return `gain ${n} block`;
      case 'loseBlock': return `lose ${n} block`;
      case 'heal': return `heal ${n}`;
      case 'power': return `gain ${n} power`;
      case 'losePower': return isAllOf(inner.amount as Amount, 'power') ? 'lose all your power' : `lose ${n} power`;
      case 'energy': return `gain ${n} energy`;
      case 'draw': return `draw ${n}`;
      case 'movement': return `gain ${n} steps`;
      default: return `${inner.kind} ${n}`;
    }
  });
  return `${whenPhrase(effect.rounds as Amount)}, ${what.join(' and ')}`;
}

function playerPhrase(
  effect: EffectData, range: number, targeting?: Targeting, afterTame = false, nameOf: NameOf = byId, mentioned = false,
): string {
  if (effect.kind === 'later') return laterPhrase(effect);
  if (effect.kind === 'boon') return boonPhrase(effect);
  if (effect.kind === 'push' || effect.kind === 'pull') return movePhrase(effect, range, mentioned);
  // After a pull or knockback the creature has moved: name it, not a tile.
  if (effect.kind === 'damage' && mentioned) {
    return simplePlayerPhrase(effect, range).replace(/to (an adjacent enemy|an enemy within \d+)$/, 'to it');
  }
  if (effect.kind === 'summon') {
    const where = targeting === 'cell' ? (range <= 1 ? ' onto an adjacent tile' : ` onto a tile within ${range}`) : '';
    return `summon ${summonedPhrase(effect, nameOf, where)}`;
  }
  if (effect.kind === 'tame' || effect.kind === 'mend') return creaturePhrase(effect, range, targeting, afterTame);
  if (effect.kind === 'terrain') {
    const area = effect.radius ? ` and every tile within ${effect.radius} of it` : '';
    return `mark ${wherePhrase(targeting, range)}${area}: ${roundsPhrase(effect)}, ${markPhrase(effect, 'your')}`;
  }
  if (effect.kind === 'area') {
    const at = targeting === 'self' || targeting === 'none' ? 'around you' : `at ${wherePhrase(targeting, range)}`;
    return `burst ${at}: ${caughtPhrase(effect, 'your')}`;
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
      case 'rekindle': return `every fire burns ${n} rounds longer`;
      case 'flare': return `every fire flares, burning whoever stands in one again for ${n} more`;
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
      case 'rekindle': return `every fire burns longer by rounds equal to ${n}`;
      case 'flare': return `every fire flares, burning whoever stands in one again for ${n} more`;
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
    case 'rekindle': return `every fire burns ${plural(n, 'round')} longer`;
    case 'flare': return n ? `every fire flares, burning whoever stands in one again for ${n} more` : 'every fire flares, burning whoever stands in one again now';
    default: return `${effect.kind} ${n}`;
  }
}

function enemyPhrase(effect: EffectData, range: number, nameOf: NameOf = byId): string {
  if (effect.kind === 'summon') return `calls ${summonedPhrase(effect, nameOf)}`;
  if (effect.kind === 'terrain') {
    // Neutral, not "your tile": a tamed creature plays this card too.
    const area = effect.radius ? ` and every tile within ${effect.radius} of it` : '';
    return `marks its target's tile${area} ${roundsPhrase(effect)}: ${markPhrase(effect, 'its')}`;
  }
  if (effect.kind === 'area') return `bursts at its target's tile: ${caughtPhrase(effect, 'its')}`;
  if (effect.kind === 'later') return `${whenPhrase(effect.rounds as Amount)}, ${tilePhrase(effect.effects, 'its')}`;
  // An enemy has no stats to raise; the validator warns.
  if (effect.kind === 'boon') return 'does nothing';
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
    case 'losePower': return isAllOf(amount, 'power') ? 'loses all its power' : `loses ${n} power`;
    case 'push': return `knocks its target back ${n}`;
    case 'pull': return `drags its target up to ${n} closer`;
    case 'rekindle': return `makes every fire burn ${n} rounds longer`;
    case 'flare': return `makes every fire flare${scaled || n !== '0' ? `, ${n} hotter` : ''}`;
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

/* A card that gives power now and a Later that takes exactly as much back,
   and nothing else in the Later, is power for a while: say so. */
function lastingPower(effects: EffectData[]): { gain: number; later: number; amount: string; rounds: string } | null {
  const gain = effects.findIndex((effect) => effect.kind === 'power');
  const later = effects.findIndex((effect) => effect.kind === 'later');
  if (gain < 0 || later < gain) return null;
  const given = effects[gain] as SimpleData;
  const back = effects[later] as LaterData;
  if (back.effects.length !== 1 || back.effects[0]!.kind !== 'losePower') return null;
  const amount = describeAmount(given.amount as Amount);
  if (describeAmount(back.effects[0]!.amount as Amount) !== amount) return null;
  return { gain, later, amount, rounds: describeAmount(back.rounds as Amount) };
}

export function writeCardText(
  effects: EffectData[], range: number, side: 'player' | 'enemy', targeting?: Targeting, nameOf: NameOf = byId,
): string {
  const lasting = side === 'player' ? lastingPower(effects) : null;
  return sentence(effects.flatMap((effect, i) => {
    // Power given and taken back later reads as power for a while.
    if (lasting && i === lasting.gain) return [`deal ${lasting.amount} more damage for ${lasting.rounds} rounds`];
    if (lasting && i === lasting.later) return [];
    if (side === 'enemy') return enemyPhrase(effect, range, nameOf);
    const earlier = effects.slice(0, i);
    const tamed = earlier.some((item) => item.kind === 'tame');
    // "It" only once the creature has been moved — or, for a move, once it
    // has been named at all.
    const moved = earlier.some((item) => item.kind === 'push' || item.kind === 'pull');
    const named = earlier.some((item) => NAMES_TARGET.has(item.kind));
    const mentioned = effect.kind === 'push' || effect.kind === 'pull' ? named : moved;
    return playerPhrase(effect, range, targeting, tamed, nameOf, mentioned);
  }));
}

/** A gem's effect happens on top of a card, so it reads as a rider. */
export function writeGemText(effects: EffectData[]): string {
  const text = sentence(effects.map((effect) => playerPhrase(effect, 1, 'enemy')));
  return text ? `${text.slice(0, -1)} when this card is played.` : '';
}
