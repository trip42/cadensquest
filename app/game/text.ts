/* Numbers in rules text that follow the rules.

   A card's text may write {1} for the number of its first effect, and
   {2.1} for the first effect inside its second — inside a mark, a burst or
   a Later. So Strike can say "Deal {1} damage" and never disagree with
   what it deals.

   Printed — on rewards, in the shop, in the editor — a token reads as the
   card's own number: "5", or "5X", or "your block". In hand it reads as
   what playing the card now would come to, bonuses included: with 3 power,
   Strike says "Deal 8 damage", and the 8 is marked as raised.

   Only numbers are substituted, never words: the author writes the verb
   ("Heal {1}", "knock it back {2}"), because verbs have no units that read
   well on their own. And nothing is evaluated — a token names an effect
   and nothing else, for the same reason amounts are data rather than
   formulas: content may one day come from a server.

   What each token's number is:
     a simple effect   its amount
     a mark            its rounds; inside, its tile effects in order —
                       `effects`, then `enter`, then `exit`
     a Later           its rounds; inside, what lands then
     a burst           its radius; inside, what each creature caught gets
     a summon          its health
     a boon            how much it adds (or multiplies by)
     a trail           its rounds; inside, its mark's tile effects

   This file knows only effects, so the validator — which the editor's save
   endpoint runs on the server too — can use it without the rules. What a
   card in hand or an enemy's intent says right now is `handText` and
   `intentText` in actions.ts, which know the game. */

import {
  type Amount, amountOf, type AmountValues, describeAmount, type Effect, isArea, isBoon, isLater, isScaled, isSummon, isTerrain,
  isTrail, type LaterEffect, type SimpleEffect,
  markEffects, readsPower, stepValues,
} from './effects';
import type { StatKey } from './stats';

/** What a boon's number measures, by the stat it raises. */
const STAT_UNITS: Partial<Record<StatKey, string>> = {
  damageBonus: 'damage', fireDamage: 'damage', slamDamage: 'damage', highGround: 'damage',
  blockBonus: 'block', blockPerRefresh: 'block',
  maxHp: 'health', healPerRefresh: 'health',
  maxEnergy: 'energy',
  movePerTurn: 'movement', movementBonus: 'movement',
};
const boonKind = (stat: StatKey): string => STAT_UNITS[stat] ?? 'boon';

/** What a number measures, so the screen can colour it the way the rest
 *  of the game does — damage red, health green, block blue, power and
 *  energy yellow, movement cyan — and leave the rest (cards drawn, rounds,
 *  reach) plain. */
export type Unit = 'damage' | 'health' | 'block' | 'power' | 'energy' | 'movement' | 'plain';

const UNITS: Record<string, Unit> = {
  damage: 'damage', flare: 'damage',
  heal: 'health', mend: 'health', tame: 'health', health: 'health',
  block: 'block', loseBlock: 'block',
  power: 'power', losePower: 'power',
  energy: 'energy',
  movement: 'movement', advance: 'movement', push: 'movement', pull: 'movement', step: 'movement',
};

/** The unit of a verb's number: "heal" and "mend" are health, "push" is
 *  movement. A mark's rounds, a burst's radius and a draw are plain. */
export const unitOf = (kind: string): Unit => UNITS[kind] ?? 'plain';

/** A run of rules text: plain words, or a number that was worked out. */
export interface TextPart {
  text: string;
  /** Set on a number from a token: what it measures. */
  unit?: Unit;
  /** A live number against the printed one: raised or lowered by bonuses. */
  change?: 'up' | 'down';
}

/** What the actor adds on top of a card's own numbers. Power is not here:
 *  it comes from the actor's values, which change as the card resolves. */
export interface Bonuses {
  /** Added to each blow and each burst's damage: `damageBonus`. */
  damage: number;
  /** Added to block the actor gains: `blockBonus`. */
  block: number;
}

/** An enemy's only bonus is its power, which its values already carry. */
export const NO_BONUSES: Bonuses = { damage: 0, block: 0 };

/** A well-formed token: {1}, {2.1}. */
const TOKEN = /\{(\d+)(?:\.(\d+))?\}/g;
/** Anything in braces, well formed or not — for the validator. */
const BRACED = /\{[^{}]*\}/g;

/** What a token points at: an amount, and which verb it belongs to. */
interface Numbered {
  amount: Amount;
  kind: string;
}

/** Inside a burst, a Later's number is its rounds. */
const roundsOfLater = (inner: SimpleEffect | LaterEffect): { kind: string; amount: Amount } =>
  (isLater(inner) ? { kind: 'rounds', amount: inner.rounds } : inner);

/** Every number a list of effects offers, by token: "1", "2.1". */
function numbered(effects: readonly Effect[]): Map<string, Numbered> {
  const found = new Map<string, Numbered>();
  effects.forEach((effect, i) => {
    const key = String(i + 1);
    const inside = (list: readonly { kind: string; amount: Amount }[]) =>
      list.forEach((inner, j) => found.set(`${key}.${j + 1}`, { amount: inner.amount, kind: inner.kind }));
    if (isTerrain(effect)) {
      found.set(key, { amount: effect.rounds, kind: 'rounds' });
      inside(markEffects(effect));
    } else if (isLater(effect)) {
      found.set(key, { amount: effect.rounds, kind: 'rounds' });
      inside(effect.effects);
    } else if (isArea(effect)) {
      found.set(key, { amount: effect.radius, kind: 'radius' });
      inside(effect.effects.map(roundsOfLater));
    } else if (isSummon(effect)) {
      found.set(key, { amount: effect.amount, kind: 'health' });
    } else if (isBoon(effect)) {
      found.set(key, { amount: effect.add ?? effect.mul ?? 0, kind: boonKind(effect.stat) });
    } else if (isTrail(effect)) {
      found.set(key, { amount: effect.rounds, kind: 'rounds' });
      inside(markEffects(effect.mark));
    } else {
      found.set(key, { amount: effect.amount, kind: effect.kind });
    }
  });
  return found;
}

/* What each number comes to if the card were played now, walking the
   effects in order as resolving them would: power gained early on the card
   counts for a blow later on it. The bonuses are the ones `resolveEffect`
   adds — a blow and a burst add power and `damageBonus`, gained block adds
   `blockBonus` — and none on a tile or in a Later, which land as they are.
   High ground is left out: it depends on the target, not yet chosen. */
function liveNumbers(effects: readonly Effect[], start: AmountValues, bonuses: Bonuses): Map<string, number> {
  const values = { ...start };
  const found = new Map<string, number>();
  effects.forEach((effect, i) => {
    const key = String(i + 1);
    // `hit` is what a burst adds to each blow: power (unless the blow was
    // worked out from it — power counts once) and the damage bonus.
    const inside = (list: readonly { kind: string; amount: Amount }[], hit?: { power: number; bonus: number }) =>
      list.forEach((inner, j) => {
        const n = amountOf(inner.amount, values);
        const extra = hit ? hit.bonus + (readsPower(inner.amount) ? 0 : hit.power) : 0;
        found.set(`${key}.${j + 1}`, inner.kind === 'damage' ? n + extra : n);
      });
    if (isTerrain(effect)) {
      found.set(key, amountOf(effect.rounds, values));
      inside(markEffects(effect));
    } else if (isLater(effect)) {
      found.set(key, amountOf(effect.rounds, values));
      inside(effect.effects);
    } else if (isArea(effect)) {
      found.set(key, effect.radius);
      inside(effect.effects.map(roundsOfLater), { power: values.power, bonus: bonuses.damage });
    } else if (isSummon(effect)) {
      found.set(key, amountOf(effect.amount, values));
    } else if (isBoon(effect)) {
      found.set(key, effect.add === undefined ? effect.mul ?? 0 : amountOf(effect.add, values));
    } else if (isTrail(effect)) {
      found.set(key, amountOf(effect.rounds, values));
      inside(markEffects(effect.mark));
    } else {
      const n = amountOf(effect.amount, values);
      const power = readsPower(effect.amount) ? 0 : values.power;
      const total = effect.kind === 'damage' ? n + power + bonuses.damage
        : effect.kind === 'block' ? n + bonuses.block
          : n;
      found.set(key, total);
      stepValues(values, effect.kind, effect.kind === 'block' ? total : n);
    }
  });
  return found;
}

function render(text: string, effects: readonly Effect[], owner: string, live?: Map<string, number>): TextPart[] {
  const parts: TextPart[] = [];
  const found = numbered(effects);
  let at = 0;
  for (const match of text.matchAll(TOKEN)) {
    const key = match[2] ? `${match[1]}.${match[2]}` : match[1]!;
    const entry = found.get(key);
    // A token pointing at nothing is left as written; the validator says so.
    if (!entry) continue;
    if (match.index > at) parts.push({ text: text.slice(at, match.index) });
    const unit = unitOf(entry.kind);
    const now = live?.get(key);
    if (now === undefined) {
      parts.push({ text: isScaled(entry.amount) ? describeAmount(entry.amount, owner) : String(entry.amount), unit });
    } else {
      const printed = isScaled(entry.amount) ? null : entry.amount;
      const change = printed === null || now === printed ? undefined : now > printed ? 'up' : 'down';
      parts.push(change ? { text: String(now), unit, change } : { text: String(now), unit });
    }
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

/** Parts back into a sentence, for a tooltip or a title. */
export const joinText = (parts: readonly TextPart[]): string => parts.map((part) => part.text).join('');

/** Text as printed: each token the card's own number. `owner` is whose
 *  values a scaled amount means — "your" for a card, "its" for an enemy's. */
export const printedParts = (text: string, effects: readonly Effect[], owner = 'your'): TextPart[] =>
  render(text, effects, owner);

/** The same, as one plain string. */
export const printedText = (text: string, effects: readonly Effect[], owner = 'your'): string =>
  joinText(printedParts(text, effects, owner));

/** Text as it would come out now, from these values and bonuses. */
export const liveText = (
  text: string, effects: readonly Effect[], values: AmountValues, bonuses: Bonuses, owner = 'your',
): TextPart[] => render(text, effects, owner, liveNumbers(effects, values, bonuses));

/** Does this text show, by token, a number of this verb? */
export function mentions(text: string, effects: readonly Effect[], kind: string): boolean {
  const found = numbered(effects);
  return [...text.matchAll(TOKEN)].some((match) => found.get(match[2] ? `${match[1]}.${match[2]}` : match[1]!)?.kind === kind);
}

/** What is wrong with the tokens in this text, one line each. */
export function tokenProblems(text: string, effects: readonly Effect[]): string[] {
  const found = numbered(effects);
  return [...text.matchAll(BRACED)].flatMap(([token]) => {
    const match = /^\{(\d+)(?:\.(\d+))?\}$/.exec(token);
    if (!match) return [`"${token}" is not a number token: write {1} for effect 1's number, or {2.1} for the first effect inside effect 2`];
    const outer = Number(match[1]);
    if (outer < 1 || outer > effects.length) {
      return [`"${token}" points at effect ${outer}, but there ${effects.length === 1 ? 'is only 1' : `are only ${effects.length}`}`];
    }
    if (match[2] && !found.has(`${match[1]}.${match[2]}`)) {
      const inner = [...found.keys()].filter((key) => key.startsWith(`${outer}.`)).length;
      return [inner
        ? `"${token}" points inside effect ${outer}, which has only ${inner} effect${inner === 1 ? '' : 's'} inside it`
        : `"${token}" points inside effect ${outer}, which has nothing inside it`];
    }
    return [];
  });
}
