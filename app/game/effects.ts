/* The shared vocabulary of things that can happen.

   Every effect is played by an ACTOR — the player for cards, gems and
   talismans; an enemy for the cards in its deck — and reads relative to it:
   `damage` hits the actor's opponent, `block` and `heal` land on the actor.
   So one list of verbs serves both sides of the fight.

   Some verbs only mean something for one side. `movement`, `energy`,
   `draw` and `step` spend the player's resources and do nothing for an
   enemy; `advance` is how an enemy walks, and does nothing for the player.

   Cards, gems and talismans all describe themselves with the same tagged
   objects rather than with code. That is what lets a reward be defined
   purely as metadata: the resolver in actions.ts is the only place that
   knows what any of them mean, so a new gem or talisman is data unless it
   needs a genuinely new verb. */

import { STAT_NAMES, type StatKey } from './stats';

export type EffectKind =
  | 'damage'
  | 'block'
  | 'loseBlock'
  | 'movement'
  | 'energy'
  | 'draw'
  | 'step'
  | 'heal'
  /** Walk up to the amount in tiles toward the opponent, stopping as soon
   *  as the card being played is in reach. */
  | 'advance'
  /** Permanently add to the damage the actor deals. */
  | 'power'
  /** Take this much off the actor's power, down to 0 — the other half of
   *  a power that lasts a while, or with "all of its power", a reset. */
  | 'losePower'
  /** Turn the targeted enemy to the actor's side, if its health is the
   *  amount or less. Never a guardian, and only while there is room. */
  | 'tame'
  /** Heal the targeted creature — an ally, or one this card just tamed. */
  | 'mend'
  /** Knock the targeted creature this many tiles straight back from the
   *  actor. Stopped by a wall or a creature, it takes the rest as damage. */
  | 'push'
  /** Drag the targeted creature up to this many tiles toward the actor,
   *  stopping beside it. */
  | 'pull'
  /** Every fire on the floor burns this many rounds longer, whoever lit it. */
  | 'rekindle'
  /** Every fire hits whoever stands in it now, for its damage plus this
   *  much, without using up that tile's hit for the round. */
  | 'flare'
  /** The next this-many cards the player plays this turn each happen
   *  twice: effects and gems, with X spent and read once. */
  | 'echo';

/* How much. Either a fixed number, or worked out from something about the
   actor at the moment the effect happens: `{ of: 'block' }` is "as much as
   your block", `{ of: 'block', times: 0.5 }` half of it, and `plus` adds a
   flat amount on top. The result is rounded down and never below zero —
   an amount is always "how much"; which way it goes is the verb's job
   (Block gains, Lose block spends).

   Deliberately a small data shape rather than a formula string: content
   may one day come from a server, and a string that is evaluated is code.
   This can be validated field by field, and cannot do anything else. */
export type AmountSource = 'block' | 'health' | 'missingHealth' | 'energy' | 'hand' | 'power' | 'x' | 'fires' | 'allies' | 'moved';

/** How far `fires` looks: burning tiles within this many steps of the
 *  actor count. A dial — too far, and it counts fires long left behind. */
export const FIRES_WITHIN = 3;

export interface ScaledAmount {
  of: AmountSource;
  /** Multiplier; 1 when left out. */
  times?: number;
  /** Added after multiplying; 0 when left out. */
  plus?: number;
}

export type Amount = number | ScaledAmount;

/** A verb and how much of it. */
export interface SimpleEffect {
  kind: EffectKind;
  amount: Amount;
}

/* Terrain: mark a tile so that whoever is on it gets these effects, for a
   number of rounds. The effects apply to the entity on the tile as if it
   had played them on itself — Damage hurts it, Block and Heal land on it.
   Amounts, and the rounds, are fixed when the tile is marked, from whoever
   marked it: "Fire X" with X = 3 burns for 3 however it is stepped on.

   A tile is hit when something steps onto it, and at the start of each of
   that thing's turns while it stands there — at most once per round per
   tile, so crossing fire burns once, standing in it burns every round, and
   pacing a healing spring heals once a round. Marking an occupied tile
   hits whoever is there at once. Marks on one tile stack as layers, each
   with its own colour and its own rounds left. */
export interface TerrainEffect {
  kind: 'terrain';
  /** How many rounds the mark lasts. A round ends as a new turn starts. */
  rounds: Amount;
  /** The tile's tint while marked, like "#e43b44". */
  colour: string;
  /** What happens to whoever is on it. Simple effects only. */
  effects: SimpleEffect[];
  /** Once, as a creature arrives on the tile, or when the tile is marked
   *  under it — not again while it stays. Pair a gain with an `exit` that
   *  takes it back: "+1 power on entering, lose 1 on leaving". */
  enter?: SimpleEffect[];
  /** Once, as a creature that got the `enter` leaves the tile — or when the
   *  mark runs out or the floor ends under it, so a buff is always taken
   *  back. */
  exit?: SimpleEffect[];
  /** Mark every tile within this many steps of the target too, not just
   *  the target — a whole burning area. 0 or left out: the one tile. */
  radius?: number;
  /** What the mark is made of, for the cards and stats that care: "fire"
   *  is heated, lengthened and flared by them. Left out, it is just a mark. */
  element?: Element;
}

/* What a mark can be made of. Fire has no side: whatever boosts, lengthens
   or counts fire works on every burning tile, whoever lit it. Oil does
   nothing alone; fire lit on it spreads across the whole slick at once. */
export type Element = 'fire' | 'oil';
export const ELEMENTS: Element[] = ['fire', 'oil'];

/** Every simple effect a burst carries, those inside a Later included. */
export const burstEffects = (effect: AreaEffect): SimpleEffect[] =>
  effect.effects.flatMap((inner) => (isLater(inner) ? inner.effects : [inner]));

/** Every simple effect a mark carries: while on it, on entering, on leaving. */
export const markEffects = (effect: TerrainEffect): SimpleEffect[] =>
  [...effect.effects, ...(effect.enter ?? []), ...(effect.exit ?? [])];

/* Area: a burst centred on the target tile that hits every creature within
   `radius` steps of it, once, at once — friend and foe alike, the caster too
   if it is inside, unless `affects` narrows it to one side. Each gets the
   listed effects as if it had played them on itself, like a marked tile,
   but amounts are worked out from the caster and damage adds the caster's
   bonuses: a burst is the caster's own attack, where a mark is not. The
   area is a diamond — every tile within `radius` steps, the way range is
   measured — so radius 1 is the tile and its four neighbours. */
export type AreaAffects = 'all' | 'foes' | 'friends';
export const AREA_AFFECTS: AreaAffects[] = ['all', 'foes', 'friends'];

export interface AreaEffect {
  kind: 'area';
  /** Steps from the target tile the burst reaches: 0 is the tile alone. */
  radius: number;
  /** The burst's colour as it goes off. */
  colour: string;
  /** Who it hits: everyone (the default), only the caster's foes, or only
   *  the caster's side. */
  affects?: AreaAffects;
  /** What happens to each creature caught: simple effects, or a Later that
   *  each one caught schedules on itself — "+2 power now, and in 2 rounds
   *  lose 2" gives every ally a power that lasts. */
  effects: Array<SimpleEffect | LaterEffect>;
}

/* Summon: bring a creature into play on the side of whoever plays it — an
   ally for the player, another enemy for an enemy. `amount` is its health,
   so it can be "based on" like any amount ("Summon a wolf with X health").
   It stands on the card's target tile if that is free, or else next to its
   summoner. `rounds`, when given, is how long it lasts; left out, it stays
   until it falls. A summoned creature drops nothing. */
export interface SummonEffect {
  kind: 'summon';
  /** The enemy definition to summon, by id. Never a guardian. */
  entity: string;
  /** Its health. */
  amount: Amount;
  /** How many rounds it lasts; left out, until it falls. */
  rounds?: Amount;
}

/* Later: effects that land on whoever played them, `rounds` rounds from
   now, as if they played them on themselves then — like a marked tile
   under their own feet, wherever they are standing. Amounts, and the
   rounds, are fixed when the card is played, from the actor then: "gain X
   power; in 2 rounds, lose X power" gives back exactly what it gave.

   That makes a power that lasts ("+2 power, −2 power in 2 rounds"), a
   price paid later ("gain 3 power, in 2 rounds take 8 damage"), or a
   reward that is worth waiting for ("in 1 round, draw 3"). They go off as
   the round begins, after block, energy and the hand are refreshed, so a
   delayed block or energy is not wiped. 0 rounds is now. */
export interface LaterEffect {
  kind: 'later';
  /** How many rounds from now. */
  rounds: Amount;
  /** What lands on the actor then. Simple effects that can go on a tile. */
  effects: SimpleEffect[];
}

/* Boon: one of the player's stats raised for a few rounds, as if a
   talisman were held that long. `add` goes on first and `mul` multiplies,
   as for a talisman; everything that reads `stat()` picks it up. Amounts
   and rounds are fixed when played, as for a Later: "for 2 rounds, fire
   deals extra damage equal to your power" keeps the power it was played
   with. Rounds count down as each new round begins, so 2 rounds is this
   one and the next. The player's only: an enemy has no stat table. */
export interface BoonEffect {
  kind: 'boon';
  stat: StatKey;
  /** Added to the stat. */
  add?: Amount;
  /** Multiplies the stat, after every `add`. */
  mul?: number;
  /** How many rounds, counting this one. */
  rounds: Amount;
}

/* Trail: for a few rounds, every tile the actor leaves gets a mark — a
   walk, a leap and being shoved all count, since each ends a motion off
   the tile it started on. The mark's radius is ignored: one tile each.
   Amounts and rounds are fixed when played. Rounds count down as each
   round begins, like a boon's, so 3 rounds is this one and two more. */
export interface TrailEffect {
  kind: 'trail';
  /** How many rounds, counting this one. */
  rounds: Amount;
  /** What each tile left behind is marked with. */
  mark: TerrainEffect;
}

export type Effect = SimpleEffect | TerrainEffect | SummonEffect | AreaEffect | LaterEffect | BoonEffect | TrailEffect;

export const isTerrain = (effect: Effect): effect is TerrainEffect => effect.kind === 'terrain';
export const isSummon = (effect: Effect): effect is SummonEffect => effect.kind === 'summon';
export const isArea = (effect: Effect): effect is AreaEffect => effect.kind === 'area';
export const isLater = (effect: Effect): effect is LaterEffect => effect.kind === 'later';
export const isBoon = (effect: Effect): effect is BoonEffect => effect.kind === 'boon';
export const isTrail = (effect: Effect): effect is TrailEffect => effect.kind === 'trail';

/** A tile's effect once it has been placed: the amount is a plain number. */
export interface TileEffect {
  kind: EffectKind;
  amount: number;
}

/** Where each value comes from, for the editor and the validator. `enemy`
 *  is false for the player's resources, which an enemy does not have. */
export const AMOUNT_SOURCES: Record<AmountSource, { label: string; phrase: string; enemy: boolean }> = {
  block: { label: 'Block', phrase: 'block', enemy: true },
  health: { label: 'Health', phrase: 'health', enemy: true },
  missingHealth: { label: 'Missing health', phrase: 'missing health', enemy: true },
  power: { label: 'Power', phrase: 'power', enemy: true },
  energy: { label: 'Energy', phrase: 'energy', enemy: false },
  hand: { label: 'Cards in hand', phrase: 'cards in hand', enemy: false },
  /* The energy an X card spent. Not "energy": by the time a card's effects
     happen its cost is paid, so an X card always leaves you on 0. */
  x: { label: 'X (energy spent)', phrase: 'X', enemy: false },
  /* Burning tiles near the actor, whoever lit them: fire has no side. */
  fires: { label: `Fires within ${FIRES_WITHIN}`, phrase: `burning tiles within ${FIRES_WITHIN}`, enemy: true },
  /* The player's living allies, tamed or summoned. */
  allies: { label: 'Allies', phrase: 'allies', enemy: false },
  /* Tiles the player has walked this turn — not leapt, not shoved. */
  moved: { label: 'Tiles walked this turn', phrase: 'tiles walked this turn', enemy: false },
};

export const AMOUNT_SOURCE_KEYS = Object.keys(AMOUNT_SOURCES) as AmountSource[];

/** The actor's values an amount can be worked out from. */
export type AmountValues = Record<AmountSource, number>;

export const isScaled = (amount: Amount): amount is ScaledAmount => typeof amount === 'object';

/** Is this amount worked out from power? Then a blow of it does not add
 *  power again as a bonus: power is counted once. */
export const readsPower = (amount: Amount): boolean => isScaled(amount) && amount.of === 'power';

/** An amount's value for these values: rounded down, never negative. */
export function amountOf(amount: Amount, values: AmountValues): number {
  if (!isScaled(amount)) return amount;
  const raw = values[amount.of] * (amount.times ?? 1) + (amount.plus ?? 0);
  return Math.max(0, Math.floor(raw));
}

/** How one simple effect changes the actor's values, for walking a card's
 *  effects in order without playing it. */
export function stepValues(values: AmountValues, kind: EffectKind, amount: number): void {
  switch (kind) {
    case 'block': values.block += amount; break;
    case 'loseBlock': values.block = Math.max(0, values.block - amount); break;
    case 'heal': {
      const healed = Math.min(amount, values.missingHealth);
      values.health += healed;
      values.missingHealth -= healed;
      break;
    }
    case 'energy': values.energy += amount; break;
    case 'power': values.power += amount; break;
    case 'losePower': values.power = Math.max(0, values.power - amount); break;
    case 'draw': values.hand += amount; break;
    default: break;
  }
}

/** What each effect of a card will come to if played now. Effects happen in
 *  order and can change what later ones read — Guard then "damage equal to
 *  your block" counts the new block — so this walks them in order on a copy
 *  of the values, the way resolving them would. */
export function previewAmounts(effects: readonly Effect[], start: AmountValues): number[] {
  const values = { ...start };
  return effects.map((effect) => {
    // A mark changes nothing about its caster; its number is its rounds.
    if (isTerrain(effect)) return amountOf(effect.rounds, values);
    // A summon changes nothing about its summoner; its number is its health.
    if (isSummon(effect)) return amountOf(effect.amount, values);
    // A burst's numbers are its inner effects', shown on their own.
    if (isArea(effect)) return 0;
    // A delayed effect changes nothing now; its number is its rounds.
    if (isLater(effect)) return amountOf(effect.rounds, values);
    // A trail changes nothing about its maker; its number is its rounds.
    if (isTrail(effect)) return amountOf(effect.rounds, values);
    // A boon changes a stat, not these values; its number is how much.
    if (isBoon(effect)) return effect.add === undefined ? effect.mul ?? 0 : amountOf(effect.add, values);
    const amount = amountOf(effect.amount, values);
    stepValues(values, effect.kind, amount);
    return amount;
  });
}

/* Two wordings: `full` for tooltips ("8 damage, −8 block") and `short`
   for the band across a card's art, which has room for about sixteen
   capitals ("8 DMG −8 BLK"). */
const NOW_SHORT: Partial<Record<EffectKind, (n: number) => string>> = {
  damage: (n) => `${n} DMG`,
  block: (n) => `+${n} BLK`,
  loseBlock: (n) => `−${n} BLK`,
  heal: (n) => `+${n} HP`,
  energy: (n) => `+${n} EN`,
  draw: (n) => `DRAW ${n}`,
  movement: (n) => `+${n} MOVE`,
  power: (n) => `+${n} POW`,
  losePower: (n) => `−${n} POW`,
  advance: (n) => `ADV ${n}`,
  tame: (n) => `TAME ≤${n}`,
  mend: (n) => `MEND ${n}`,
  push: (n) => `PUSH ${n}`,
  pull: (n) => `PULL ${n}`,
  rekindle: (n) => `FIRE +${n} RND`,
  flare: (n) => `FLARE +${n}`,
  echo: (n) => `ECHO ${n}`,
};

const NOW_LABELS: Partial<Record<EffectKind, (n: number) => string>> = {
  damage: (n) => `${n} damage`,
  block: (n) => `+${n} block`,
  loseBlock: (n) => `−${n} block`,
  heal: (n) => `heal ${n}`,
  energy: (n) => `+${n} energy`,
  draw: (n) => `draw ${n}`,
  movement: (n) => `+${n} move`,
  power: (n) => `+${n} power`,
  losePower: (n) => `−${n} power`,
  advance: (n) => `advance ${n}`,
  tame: (n) => `tames at ${n} health or less`,
  mend: (n) => `mends ${n}`,
  push: (n) => `knocks back ${n}`,
  pull: (n) => `pulls in ${n}`,
  rekindle: (n) => `every fire +${n} rounds`,
  flare: (n) => `every fire flares +${n}`,
  echo: (n) => `next ${n} card${n === 1 ? '' : 's'} twice`,
};

/** What the effects that depend on the moment come to right now — "8
 *  damage, −8 block" — or null if none do. Fixed amounts are left out:
 *  the card already says them. Bonuses from talismans are left out too,
 *  as they are from every card's printed numbers. */
export function nowText(effects: readonly Effect[], values: AmountValues, style: 'full' | 'short' = 'full'): string | null {
  if (!hasScaledAmount(effects)) return null;
  const amounts = previewAmounts(effects, values);
  const labels = style === 'short' ? NOW_SHORT : NOW_LABELS;
  const parts = effects
    .flatMap((effect, i) => {
      if (isSummon(effect)) {
        const health = isScaled(effect.amount) ? [style === 'short' ? `${amounts[i]} HP` : `${amounts[i]} health`] : [];
        const rounds = effect.rounds !== undefined && isScaled(effect.rounds)
          ? [style === 'short' ? `${amountOf(effect.rounds, values)} RND` : `${amountOf(effect.rounds, values)} rounds`]
          : [];
        return [...health, ...rounds];
      }
      if (isArea(effect)) {
        return burstEffects(effect)
          .filter((inner) => isScaled(inner.amount))
          .map((inner) => `${style === 'short' ? 'AREA' : 'each'} ${labels[inner.kind]?.(amountOf(inner.amount, values))}`);
      }
      if (isTrail(effect)) {
        const rounds = isScaled(effect.rounds) ? [style === 'short' ? `${amounts[i]} RND` : `${amounts[i]} rounds`] : [];
        const inner = markEffects(effect.mark)
          .filter((tile) => isScaled(tile.amount))
          .map((tile) => `${style === 'short' ? 'TILE' : 'tile'} ${labels[tile.kind]?.(amountOf(tile.amount, values))}`);
        return [...rounds, ...inner];
      }
      if (isBoon(effect)) {
        const add = effect.add !== undefined && isScaled(effect.add)
          ? [style === 'short' ? `+${amounts[i]} ${STAT_NAMES[effect.stat].toUpperCase()}` : `+${amounts[i]} ${STAT_NAMES[effect.stat]}`]
          : [];
        const rounds = isScaled(effect.rounds) ? [style === 'short' ? `${amountOf(effect.rounds, values)} RND` : `${amountOf(effect.rounds, values)} rounds`] : [];
        return [...add, ...rounds];
      }
      if (isLater(effect)) {
        const rounds = isScaled(effect.rounds) ? [style === 'short' ? `IN ${amounts[i]}` : `in ${amounts[i]} rounds`] : [];
        const inner = effect.effects
          .filter((later) => isScaled(later.amount))
          .map((later) => `${style === 'short' ? 'LATER' : 'later'} ${labels[later.kind]?.(amountOf(later.amount, values))}`);
        return [...rounds, ...inner];
      }
      if (!isTerrain(effect)) return isScaled(effect.amount) ? [labels[effect.kind]?.(amounts[i]!)] : [];
      // A mark: how long, and what its tile will do, fixed from now.
      const rounds = isScaled(effect.rounds) ? [style === 'short' ? `${amounts[i]} RND` : `${amounts[i]} rounds`] : [];
      const inner = markEffects(effect)
        .filter((tile) => isScaled(tile.amount))
        .map((tile) => `${style === 'short' ? 'TILE' : 'tile'} ${labels[tile.kind]?.(amountOf(tile.amount, values))}`);
      return [...rounds, ...inner];
    })
    .filter((part): part is string => !!part);
  return parts.length ? parts.join(style === 'short' ? ' ' : ', ') : null;
}

/** Does anything on this list depend on the moment it is played? */
export const hasScaledAmount = (effects: readonly Effect[]): boolean =>
  effects.some((effect) =>
    isTerrain(effect)
      ? isScaled(effect.rounds) || markEffects(effect).some((tile) => isScaled(tile.amount))
      : isSummon(effect)
        ? isScaled(effect.amount) || (effect.rounds !== undefined && isScaled(effect.rounds))
        : isArea(effect)
          ? effect.effects.some((inner) => (isLater(inner) ? hasScaledAmount([inner]) : isScaled(inner.amount)))
          : isLater(effect)
            ? isScaled(effect.rounds) || effect.effects.some((inner) => isScaled(inner.amount))
            : isBoon(effect)
              ? isScaled(effect.rounds) || (effect.add !== undefined && isScaled(effect.add))
              : isTrail(effect)
                ? isScaled(effect.rounds) || hasScaledAmount([effect.mark])
                : isScaled(effect.amount));


/* What each verb is, for the content editor and the validator: a plain
   label, what the number means, and which side it does anything for. A
   verb one side cannot use is a no-op for it — harmless, but almost
   certainly a mistake in the content, so the validator warns. */
/* `tile` says whether a verb can go on a marked tile. Leap and Advance
   are about the actor moving itself, which means nothing for a tile. */
export const EFFECT_INFO: Record<EffectKind, { label: string; help: string; player: boolean; enemy: boolean; tile: boolean }> = {
  damage: { label: 'Damage', help: 'Hit the target for this much.', player: true, enemy: true, tile: true },
  block: { label: 'Block', help: 'Absorbs this much damage until the next turn.', player: true, enemy: true, tile: true },
  loseBlock: { label: 'Lose block', help: 'Spend this much of your own block.', player: true, enemy: true, tile: true },
  heal: { label: 'Heal', help: 'Restore this much health, up to the maximum.', player: true, enemy: true, tile: true },
  power: { label: 'Power', help: 'Permanently add this much to every hit.', player: true, enemy: true, tile: true },
  losePower: { label: 'Lose power', help: 'Take this much off your power, down to 0. "All of your power" is a reset. Pair it with Power in a Later to make power that lasts a few rounds.', player: true, enemy: true, tile: true },
  movement: { label: 'Movement', help: 'Gain this many steps this turn.', player: true, enemy: false, tile: true },
  energy: { label: 'Energy', help: 'Gain this much energy this turn.', player: true, enemy: false, tile: true },
  draw: { label: 'Draw', help: 'Draw this many cards.', player: true, enemy: false, tile: true },
  step: { label: 'Leap', help: 'Jump to the targeted square. The number is unused.', player: true, enemy: false, tile: false },
  advance: { label: 'Advance', help: 'Walk up to this many tiles toward the nearest foe, stopping once in range.', player: false, enemy: true, tile: false },
  tame: { label: 'Tame', help: 'Turn the targeted enemy to your side if its health is this much or less. Not guardians; only while you have room for another ally.', player: true, enemy: false, tile: false },
  mend: { label: 'Mend', help: 'Heal the targeted creature this much — an ally, or one this card just tamed.', player: true, enemy: false, tile: false },
  push: { label: 'Knockback', help: 'Knock the target this many tiles straight back. If a wall or another creature stops it, both take damage for each tile it had left. Guardians hold their ground.', player: true, enemy: true, tile: false },
  pull: { label: 'Pull', help: 'Drag the target up to this many tiles toward you, stopping beside you. Guardians hold their ground.', player: true, enemy: true, tile: false },
  rekindle: { label: 'Rekindle', help: 'Every fire on the floor burns this many rounds longer — whoever lit it.', player: true, enemy: true, tile: false },
  flare: { label: 'Flare', help: 'Every fire on the floor hits whoever stands in it now, for its damage plus this much — whoever lit it. It does not use up that fire\'s hit for the round.', player: true, enemy: true, tile: false },
  echo: { label: 'Echo', help: 'The next this-many cards you play this turn each happen twice — their gems too. X is spent and read once.', player: true, enemy: false, tile: false },
};

export const EFFECT_KINDS = Object.keys(EFFECT_INFO) as EffectKind[];

/** The verbs a marked tile can carry. */
export const TILE_KINDS = EFFECT_KINDS.filter((kind) => EFFECT_INFO[kind].tile);

export const AREA_INFO = {
  label: 'Area',
  help: 'A burst on the target tile: everyone within the radius gets these effects at once — friends too, and you if you are inside, unless narrowed.',
};

export const SUMMON_INFO = {
  label: 'Summon',
  help: 'Bring a creature into play on your side, with this much health — on the target tile if it is free, else beside you.',
};

export const LATER_INFO = {
  label: 'Later',
  help: 'After this many rounds, these land on you — as if you played them on yourself then. Amounts are fixed when played.',
};

export const TRAIL_INFO = {
  label: 'Trail',
  help: 'For this many rounds, counting this one, every tile left behind gets this mark — walking, leaping or shoved.',
};

export const BOON_INFO = {
  label: 'Boon',
  help: 'Raise one of your stats for this many rounds, counting this one — as if you held a talisman that long. Yours only: an enemy has no stats.',
};

export const TERRAIN_INFO = {
  label: 'Terrain',
  help: 'Mark the targeted tile: whoever is on it gets these effects, for this many rounds.',
};

/** Where a talisman's effects can fire. */
export type TriggerPoint =
  | 'refresh'
  | 'playerPhaseEnd'
  | 'enemyPhaseEnd'
  | 'cardPlayed'
  | 'enemyDefeated';

export const TRIGGER_INFO: Record<TriggerPoint, string> = {
  refresh: 'At the start of each turn',
  playerPhaseEnd: 'When you end your phase',
  enemyPhaseEnd: 'After the enemies have acted',
  cardPlayed: 'Whenever you play a card',
  enemyDefeated: 'Whenever an enemy falls — aimed at where it fell',
};

export const TRIGGER_POINTS = Object.keys(TRIGGER_INFO) as TriggerPoint[];

export interface Trigger {
  on: TriggerPoint;
  effects: Effect[];
}

/** How an amount reads: "6", "your block", "half your block + 2". `owner`
 *  is whose values a scaled amount means — "your" or "its". */
export function describeAmount(amount: Amount, owner = 'your'): string {
  if (!isScaled(amount)) return String(amount);
  const times = amount.times ?? 1;
  const plus = amount.plus ?? 0;
  // X reads the way cards print it: X, 2X, X + 1 — not "your X".
  if (amount.of === 'x') {
    const x = times === 1 ? 'X' : `${times}X`;
    return plus > 0 ? `${x} + ${plus}` : plus < 0 ? `${x} − ${-plus}` : x;
  }
  // Fire has no side: they are nobody's fires, just the ones nearby.
  const base = amount.of === 'fires' ? `the ${AMOUNT_SOURCES.fires.phrase}` : `${owner} ${AMOUNT_SOURCES[amount.of].phrase}`;
  const scaled = times === 1 ? base : times === 0.5 ? `half ${base}` : times === 2 ? `twice ${base}` : `${times} × ${base}`;
  return plus > 0 ? `${scaled} + ${plus}` : plus < 0 ? `${scaled} − ${-plus}` : scaled;
}

/** Human-readable summary of an effect, for talisman lines and previews. */
/** How a tile's effect reads, from the point of view of whoever is on it:
 *  "take 3 damage", "gain 4 block". */
export function describeTileEffect(effect: SimpleEffect | TileEffect): string {
  const n = describeAmount(effect.amount, 'the marker\'s');
  switch (effect.kind) {
    case 'damage': return `take ${n} damage`;
    case 'block': return `gain ${n} block`;
    case 'loseBlock': return `lose ${n} block`;
    case 'heal': return `heal ${n}`;
    case 'power': return `gain ${n} power`;
    case 'losePower': return `lose ${n} power`;
    case 'energy': return `gain ${n} energy`;
    case 'draw': return `draw ${n}`;
    case 'movement': return `gain ${n} movement`;
    default: return `${effect.kind} ${n}`;
  }
}

/** A mark's effects, fixed: "take 2 damage; on entering, gain 1 power;
 *  on leaving, lose 1 power". For the tile's tooltip. */
export function describeMark(effects: readonly TileEffect[], enter?: readonly TileEffect[], exit?: readonly TileEffect[]): string {
  return [
    effects.map(describeTileEffect).join(', '),
    enter?.length ? `on entering, ${enter.map(describeTileEffect).join(', ')}` : '',
    exit?.length ? `on leaving, ${exit.map(describeTileEffect).join(', ')}` : '',
  ].filter(Boolean).join('; ');
}

export function describeEffect(effect: Effect): string {
  if (isTrail(effect)) {
    const rounds = describeAmount(effect.rounds);
    return `for ${rounds} round${rounds === '1' ? '' : 's'}, every tile left behind: ${describeEffect(effect.mark)}`;
  }
  if (isBoon(effect)) {
    const rounds = describeAmount(effect.rounds);
    const what = [
      effect.add === undefined ? '' : `+${describeAmount(effect.add)} ${STAT_NAMES[effect.stat]}`,
      effect.mul === undefined ? '' : `${STAT_NAMES[effect.stat]} ×${effect.mul}`,
    ].filter(Boolean).join(', ');
    return `for ${rounds} round${rounds === '1' ? '' : 's'}: ${what}`;
  }
  if (isArea(effect)) {
    const who = effect.affects === 'foes' ? 'every foe' : effect.affects === 'friends' ? 'every friend' : 'everyone';
    const what = effect.effects.map((inner) => (isLater(inner) ? describeEffect(inner) : describeTileEffect(inner)));
    return `burst (radius ${effect.radius}): ${who} caught will ${what.join(', ')}`;
  }
  if (isSummon(effect)) {
    const rounds = effect.rounds === undefined ? '' : ` for ${describeAmount(effect.rounds)} rounds`;
    return `summon a ${effect.entity} with ${describeAmount(effect.amount)} health${rounds}`;
  }
  if (isLater(effect)) {
    const rounds = describeAmount(effect.rounds);
    return `in ${rounds} round${rounds === '1' ? '' : 's'}: ${effect.effects.map(describeTileEffect).join(', ')}`;
  }
  if (isTerrain(effect)) {
    const rounds = describeAmount(effect.rounds);
    const parts = [
      effect.effects.length ? effect.effects.map(describeTileEffect).join(', ') : '',
      effect.enter?.length ? `on entering, ${effect.enter.map(describeTileEffect).join(', ')}` : '',
      effect.exit?.length ? `on leaving, ${effect.exit.map(describeTileEffect).join(', ')}` : '',
    ].filter(Boolean);
    return `mark a tile for ${rounds} round${rounds === '1' ? '' : 's'}: ${parts.join('; ')}`;
  }
  const n = describeAmount(effect.amount);
  const scaled = isScaled(effect.amount);
  switch (effect.kind) {
    case 'damage': return scaled ? `deal damage equal to ${n}` : `deal ${n}`;
    case 'block': return scaled ? `gain block equal to ${n}` : `gain ${n} block`;
    case 'loseBlock': return scaled ? `lose block equal to ${n}` : `lose ${n} block`;
    case 'movement': return scaled ? `gain movement equal to ${n}` : `gain ${n} movement`;
    case 'energy': return scaled ? `gain energy equal to ${n}` : `gain ${n} energy`;
    case 'draw': return scaled ? `draw cards equal to ${n}` : `draw ${n}`;
    case 'heal': return scaled ? `heal equal to ${n}` : `heal ${n}`;
    case 'step': return 'leap';
    case 'advance': return scaled ? `advance up to ${n}` : `advance ${n}`;
    case 'power': return scaled ? `gain power equal to ${n}` : `+${n} damage from now on`;
    case 'losePower': return scaled ? `lose power equal to ${n}` : `lose ${n} power`;
    case 'tame': return `tame it if its health is ${n} or less`;
    case 'mend': return scaled ? `heal the target equal to ${n}` : `heal the target ${n}`;
    case 'push': return scaled ? `knock the target back equal to ${n}` : `knock the target back ${n}`;
    case 'pull': return scaled ? `pull the target in equal to ${n}` : `pull the target in ${n}`;
    case 'rekindle': return scaled ? `every fire burns longer by ${n} rounds` : `every fire burns ${n} rounds longer`;
    case 'echo': return `the next ${n} card${n === '1' ? '' : 's'} played this turn happen twice`;
    case 'flare': return scaled ? `every fire flares, ${n} hotter` : `every fire flares${n === '0' ? '' : `, ${n} hotter`}`;
  }
}
