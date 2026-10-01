/* The shape of the content files, as a runtime schema.

   TypeScript checks the definitions that live in code; content arrives at
   runtime as JSON, so it is checked here instead — by the game when it
   loads, by `npm test`, and by the editor before it will save. The schema
   covers shape (right fields, right kinds, sensible numbers); `validate.ts`
   adds what a schema cannot see, like a deck naming a card that does not
   exist. */

import { z } from 'zod';
import { RARITIES, TARGETINGS } from '../cards/types';
import {
  AMOUNT_SOURCE_KEYS, AREA_AFFECTS, type AmountSource, type AreaAffects, EFFECT_KINDS, type EffectKind, type Element, ELEMENTS,
  TRIGGER_POINTS,
} from '../effects';
import { REWARD_KINDS } from '../rewards';
import { STAT_KEYS, type StatKey } from '../stats';

const count = (min = 0, max = 999) => z.number().int('must be a whole number').min(min).max(max);

/** Ids are how everything refers to everything, and how analytics names
 *  things, so they are plain and permanent: lower case, digits and _. */
export const idSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'use lower-case letters, digits and _, starting with a letter');

const nameSchema = z.string().trim().min(1, 'needs a name');

/** A fixed number, or one worked out from the actor when the effect
 *  happens: `{ "of": "block", "times": 0.5, "plus": 2 }`. */
export const scaledAmountSchema = z.strictObject({
  of: z.enum(AMOUNT_SOURCE_KEYS as [AmountSource, ...AmountSource[]]),
  times: z.number().positive('must be more than 0').max(10).optional(),
  plus: z.number().int('must be a whole number').min(-99).max(99).optional(),
});

export const amountSchema = z.union([count(0, 99), scaledAmountSchema]);

export const simpleEffectSchema = z.strictObject({
  kind: z.enum(EFFECT_KINDS as [EffectKind, ...EffectKind[]]),
  amount: amountSchema,
});

const colourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour like #d9544d');

/** Mark a tile: whoever is on it gets `effects`, for `rounds` rounds —
 *  and `enter` once as it arrives, `exit` once as it leaves. The validator
 *  checks that at least one of the three has something in it. */
export const terrainEffectSchema = z.strictObject({
  kind: z.literal('terrain'),
  rounds: amountSchema,
  colour: colourSchema,
  effects: z.array(simpleEffectSchema),
  enter: z.array(simpleEffectSchema).optional(),
  exit: z.array(simpleEffectSchema).optional(),
  /** Mark every tile within this many steps of the target too. */
  radius: count(0, 3).optional(),
  /** What it is made of: "fire" for the fire cards and stats to find. */
  element: z.enum(ELEMENTS as [Element, ...Element[]]).optional(),
});

/** Effects that land on whoever played it, `rounds` rounds from now, with
 *  amounts fixed when played. Any effect, by shape — the validator keeps
 *  out what cannot land with nothing aimed at (`canGoInLater`). A getter,
 *  because a Later can hold a Later, and a burst that holds one too. */
export const laterEffectSchema = z.strictObject({
  kind: z.literal('later'),
  rounds: amountSchema,
  get effects(): z.ZodArray<typeof effectSchema> {
    return z.array(effectSchema).min(1, 'needs at least one effect');
  },
});

/** A burst on the target tile: everyone within `radius` steps gets
 *  `effects` at once — narrowed to one side by `affects`, if given. A Later
 *  among them is scheduled on each one caught. */
export const areaEffectSchema = z.strictObject({
  kind: z.literal('area'),
  radius: count(0, 3),
  colour: colourSchema,
  affects: z.enum(AREA_AFFECTS as [AreaAffects, ...AreaAffects[]]).optional(),
  effects: z.array(z.discriminatedUnion('kind', [simpleEffectSchema, laterEffectSchema])).min(1, 'a burst needs at least one effect'),
});

/** Bring a creature into play on the player's side — or, on an enemy card,
 *  the enemy's. `amount` is its health; `rounds`, if given, how long it
 *  lasts. */
export const summonEffectSchema = z.strictObject({
  kind: z.literal('summon'),
  entity: idSchema,
  amount: amountSchema,
  rounds: amountSchema.optional(),
});

/** One of the player's stats raised for `rounds` rounds, counting this one:
 *  `add` on, then `mul`. The validator wants at least one of the two. */
export const boonEffectSchema = z.strictObject({
  kind: z.literal('boon'),
  stat: z.enum(STAT_KEYS as [StatKey, ...StatKey[]]),
  add: amountSchema.optional(),
  mul: z.number().positive('must be more than 0').max(10).optional(),
  rounds: amountSchema,
});

/** For `rounds` rounds, counting this one, every tile the actor leaves
 *  gets `mark` — its radius ignored. */
export const trailEffectSchema = z.strictObject({
  kind: z.literal('trail'),
  rounds: amountSchema,
  mark: terrainEffectSchema,
});

export const effectSchema = z.discriminatedUnion('kind', [
  simpleEffectSchema, terrainEffectSchema, summonEffectSchema, areaEffectSchema, laterEffectSchema, boonEffectSchema,
  trailEffectSchema,
]);

export const cardSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  enabled: z.boolean(),
  rarity: z.enum(RARITIES),
  art: z.string().optional(),
  /** A number, or "X": spends all your energy; effects read it as X. */
  cost: z.union([count(0, 9), z.literal('X')]),
  targeting: z.enum(TARGETINGS),
  range: count(0, 12),
  text: z.string(),
  effects: z.array(effectSchema).min(1, 'needs at least one effect'),
  movement: count(0, 9).optional(),
});

/** An enemy's card. It never costs anything, has no rarity and always aims
 *  at the player, so only what varies is written down. */
export const enemyCardSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  enabled: z.boolean(),
  range: count(0, 12),
  text: z.string(),
  effects: z.array(effectSchema).min(1, 'needs at least one effect'),
  /** Played once, then gone from that creature's deck for good. */
  lost: z.boolean().optional(),
});

const weightTable = <K extends string>(keys: readonly K[]) =>
  z.partialRecord(z.enum(keys as unknown as [K, ...K[]]), count(0, 1000));

export const rewardSchema = z.strictObject({
  /** How likely it is to be carrying anything at all, 0..1; 1 if left out. */
  chance: z.number().min(0).max(1).optional(),
  weights: weightTable(REWARD_KINDS).optional(),
  cardChoices: count(1, 6).optional(),
  cardRarity: weightTable(RARITIES).optional(),
  gemWeights: z.record(idSchema, count(0, 1000)).optional(),
  talismanPool: z.array(idSchema).optional(),
});

export const enemySchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  enabled: z.boolean(),
  guardian: z.boolean().optional(),
  /** Spawns at most once a run. */
  unique: z.boolean().optional(),
  maxHp: count(1, 999),
  sprite: z.strictObject({
    sheet: z.string().min(1),
    col: count(0, 99),
    row: count(0, 99),
    faces: z.union([z.literal(1), z.literal(-1)]),
    footprint: z.strictObject({ width: count(8, 400), height: count(8, 400) }),
    offsetY: z.number().optional(),
  }),
  deck: z.array(idSchema).min(1, 'needs at least one card'),
  reward: rewardSchema.optional(),
  /** Coins it drops when it falls, to spend in shops. */
  coins: count(0, 999).optional(),
  /** What happens as it falls, aimed at nothing — what a Later may hold:
   *  summons beside it, a burst around it, a mark under it. */
  onDeath: z.array(effectSchema).optional(),
});

export const gemSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  enabled: z.boolean(),
  colour: colourSchema,
  text: z.string(),
  /** What happens after the card's own effects; may be empty for a gem that
   *  only changes the card. The validator wants it to do something. */
  effects: z.array(effectSchema),
  /** Added to the card's energy cost, never below 0. */
  cost: z.number().int('must be a whole number').min(-3).max(3).optional(),
  /** Multiplies the card's damage. */
  damage: z.number().positive('must be more than 0').max(5).optional(),
  /** Multiplies the card's block. */
  block: z.number().positive('must be more than 0').max(5).optional(),
});

export const talismanSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  enabled: z.boolean(),
  text: z.string(),
  icon: z.string().min(1),
  modifiers: z
    .array(z.strictObject({
      stat: z.enum(STAT_KEYS as [string, ...string[]]),
      add: z.number().optional(),
      mul: z.number().positive().optional(),
    }))
    .optional(),
  triggers: z
    .array(z.strictObject({
      on: z.enum(TRIGGER_POINTS as [string, ...string[]]),
      effects: z.array(effectSchema).min(1, 'needs at least one effect'),
    }))
    .optional(),
});

/** How one kind of tile looks in a zone: its three faces, how far its
 *  surface sits from the layer line (water sinks), and its texture. */
export const facePaletteSchema = z.strictObject({
  top: colourSchema,
  left: colourSchema,
  right: colourSchema,
  elev: z.number().int().min(-20).max(20),
  texture: z.enum(['blades', 'speckle', 'ripple', 'grain', 'none']),
});

const odds = z.number().min(0).max(1);

/** How a zone's ground is shaped. */
export const zoneTerrainSchema = z.strictObject({
  minHeight: count(1, 9),
  maxHeight: count(1, 9),
  forkChance: odds,
  mergeChance: odds,
  waterChance: odds,
  rockChance: odds,
  widthDrift: odds,
  peakChance: odds,
  peakHeight: count(0, 5),
});

/** One chunk of a zone (16 rows): who spawns, how many, and who may stand
 *  on its last row. */
export const zoneChunkSchema = z.strictObject({
  enemies: z.array(idSchema),
  density: count(0, 12),
  /** One is chosen at random for the chunk's last row. On the zone's last
   *  chunk it holds the way down. */
  guardians: z.array(idSchema).optional(),
});

/** A zone is a floor: its look, its ground, and its chunks in order. The
 *  file's order is the order the floors come in. */
export const zoneSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  palette: z.strictObject({
    ground: facePaletteSchema,
    trail: facePaletteSchema,
    water: facePaletteSchema,
    rock: facePaletteSchema,
  }),
  terrain: zoneTerrainSchema,
  chunks: z.array(zoneChunkSchema).min(1, 'needs at least one chunk').max(8, 'at most 8 chunks'),
});

export const runSchema = z.strictObject({
  startingDeck: z.array(idSchema).min(1, 'needs at least one card'),
});

/** One schema per file, keyed by the file's name in `content/`. */
export const FILE_SCHEMAS = {
  cards: z.array(cardSchema),
  'enemy-cards': z.array(enemyCardSchema),
  enemies: z.array(enemySchema),
  gems: z.array(gemSchema),
  talismans: z.array(talismanSchema),
  zones: z.array(zoneSchema),
  run: runSchema,
} as const;

export type ContentFile = keyof typeof FILE_SCHEMAS;
export const CONTENT_FILES = Object.keys(FILE_SCHEMAS) as ContentFile[];

export type CardData = z.infer<typeof cardSchema>;
export type EnemyCardData = z.infer<typeof enemyCardSchema>;
export type EnemyData = z.infer<typeof enemySchema>;
export type GemData = z.infer<typeof gemSchema>;
export type TalismanData = z.infer<typeof talismanSchema>;
export type ZoneData = z.infer<typeof zoneSchema>;
export type RunData = z.infer<typeof runSchema>;
export type EffectData = z.infer<typeof effectSchema>;
export type AmountData = z.infer<typeof amountSchema>;

/** Everything the game is built from, as it sits in the files. */
export interface Content {
  cards: CardData[];
  'enemy-cards': EnemyCardData[];
  enemies: EnemyData[];
  gems: GemData[];
  talismans: TalismanData[];
  zones: ZoneData[];
  run: RunData;
}
