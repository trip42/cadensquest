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
  /** Turn the targeted enemy to the actor's side, if its health is the
   *  amount or less. Never a guardian, and only while there is room. */
  | 'tame'
  /** Heal the targeted creature — an ally, or one this card just tamed. */
  | 'mend';

/* How much. Either a fixed number, or worked out from something about the
   actor at the moment the effect happens: `{ of: 'block' }` is "as much as
   your block", `{ of: 'block', times: 0.5 }` half of it, and `plus` adds a
   flat amount on top. The result is rounded down and never below zero —
   an amount is always "how much"; which way it goes is the verb's job
   (Block gains, Lose block spends).

   Deliberately a small data shape rather than a formula string: content
   may one day come from a server, and a string that is evaluated is code.
   This can be validated field by field, and cannot do anything else. */
export type AmountSource = 'block' | 'health' | 'missingHealth' | 'energy' | 'hand' | 'power' | 'x';

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
}

export type Effect = SimpleEffect | TerrainEffect;

export const isTerrain = (effect: Effect): effect is TerrainEffect => effect.kind === 'terrain';

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
};

export const AMOUNT_SOURCE_KEYS = Object.keys(AMOUNT_SOURCES) as AmountSource[];

/** The actor's values an amount can be worked out from. */
export type AmountValues = Record<AmountSource, number>;

export const isScaled = (amount: Amount): amount is ScaledAmount => typeof amount === 'object';

/** An amount's value for these values: rounded down, never negative. */
export function amountOf(amount: Amount, values: AmountValues): number {
  if (!isScaled(amount)) return amount;
  const raw = values[amount.of] * (amount.times ?? 1) + (amount.plus ?? 0);
  return Math.max(0, Math.floor(raw));
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
    const amount = amountOf(effect.amount, values);
    switch (effect.kind) {
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
      case 'draw': values.hand += amount; break;
      default: break;
    }
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
  advance: (n) => `ADV ${n}`,
  tame: (n) => `TAME ≤${n}`,
  mend: (n) => `MEND ${n}`,
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
  advance: (n) => `advance ${n}`,
  tame: (n) => `tames at ${n} health or less`,
  mend: (n) => `mends ${n}`,
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
      if (!isTerrain(effect)) return isScaled(effect.amount) ? [labels[effect.kind]?.(amounts[i]!)] : [];
      // A mark: how long, and what its tile will do, fixed from now.
      const rounds = isScaled(effect.rounds) ? [style === 'short' ? `${amounts[i]} RND` : `${amounts[i]} rounds`] : [];
      const inner = effect.effects
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
      ? isScaled(effect.rounds) || effect.effects.some((tile) => isScaled(tile.amount))
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
  movement: { label: 'Movement', help: 'Gain this many steps this turn.', player: true, enemy: false, tile: true },
  energy: { label: 'Energy', help: 'Gain this much energy this turn.', player: true, enemy: false, tile: true },
  draw: { label: 'Draw', help: 'Draw this many cards.', player: true, enemy: false, tile: true },
  step: { label: 'Leap', help: 'Jump to the targeted square. The number is unused.', player: true, enemy: false, tile: false },
  advance: { label: 'Advance', help: 'Walk up to this many tiles toward the nearest foe, stopping once in range.', player: false, enemy: true, tile: false },
  tame: { label: 'Tame', help: 'Turn the targeted enemy to your side if its health is this much or less. Not guardians; only while you have room for another ally.', player: true, enemy: false, tile: false },
  mend: { label: 'Mend', help: 'Heal the targeted creature this much — an ally, or one this card just tamed.', player: true, enemy: false, tile: false },
};

export const EFFECT_KINDS = Object.keys(EFFECT_INFO) as EffectKind[];

/** The verbs a marked tile can carry. */
export const TILE_KINDS = EFFECT_KINDS.filter((kind) => EFFECT_INFO[kind].tile);

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
  enemyDefeated: 'Whenever an enemy falls',
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
  const base = `${owner} ${AMOUNT_SOURCES[amount.of].phrase}`;
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
    case 'energy': return `gain ${n} energy`;
    case 'draw': return `draw ${n}`;
    case 'movement': return `gain ${n} movement`;
    default: return `${effect.kind} ${n}`;
  }
}

export function describeEffect(effect: Effect): string {
  if (isTerrain(effect)) {
    const rounds = describeAmount(effect.rounds);
    return `mark a tile for ${rounds} round${rounds === '1' ? '' : 's'}: ${effect.effects.map(describeTileEffect).join(', ')}`;
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
    case 'tame': return `tame it if its health is ${n} or less`;
    case 'mend': return scaled ? `heal the target equal to ${n}` : `heal the target ${n}`;
  }
}
