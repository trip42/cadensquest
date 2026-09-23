/* Enemy cards.

   An enemy's behaviour is a deck of these, listed on its definition. Each
   turn it plays the top card, resolving the effects in order — so
   `[advance 3, damage 4]` walks in, then strikes — and a new card is drawn
   at refresh and shown above its head, so you can see it coming.

   A card's `range` is its reach: `advance` stops as soon as the target is
   within it, and `damage` only lands if it still is when the blow comes.
   Damage adds the enemy's `power`, which `power` effects raise.

   Everything an enemy does is here as data. A new behaviour is a new card
   and a line in some enemy's deck; the rules never need to hear about it. */

import type { Effect } from '../effects';
import type { CardDefinition } from './types';

/** Terse constructor: enemy cards never cost energy, have no rarity to
 *  speak of, and always aim at the player. */
const card = (id: string, name: string, range: number, text: string, effects: Effect[]): CardDefinition => ({
  id,
  name,
  cost: 0,
  rarity: 'normal',
  targeting: 'enemy',
  range,
  text,
  effects,
});

export const INTENTS: Record<string, CardDefinition> = {
  // Slime — slow, and hardens up when it cannot reach you.
  slime_ooze: card('slime_ooze', 'Ooze', 1, 'Creeps 1 closer and hits for 3.', [
    { kind: 'advance', amount: 1 },
    { kind: 'damage', amount: 3 },
  ]),
  slime_harden: card('slime_harden', 'Harden', 1, 'Creeps 1 closer and gains 5 block.', [
    { kind: 'advance', amount: 1 },
    { kind: 'block', amount: 5 },
  ]),

  // Dragon — breathes from range and works itself into a rage.
  dragon_breath: card('dragon_breath', 'Breath', 3, 'Closes up to 2, then burns for 8 at range 3.', [
    { kind: 'advance', amount: 2 },
    { kind: 'damage', amount: 8 },
  ]),
  dragon_rage: card('dragon_rage', 'Rage', 3, 'Its attacks deal 2 more from now on.', [
    { kind: 'power', amount: 2 },
  ]),
  dragon_wingbeat: card('dragon_wingbeat', 'Wingbeat', 3, 'Beats forward up to 4.', [
    { kind: 'advance', amount: 4 },
  ]),

  // Bug — all legs. Mostly running, sometimes biting.
  bug_skitter: card('bug_skitter', 'Skitter', 1, 'Runs up to 6 toward you.', [
    { kind: 'advance', amount: 6 },
  ]),
  bug_bite: card('bug_bite', 'Bite', 1, 'Closes up to 3 and bites for 3.', [
    { kind: 'advance', amount: 3 },
    { kind: 'damage', amount: 3 },
  ]),

  // Spider — keeps its distance and spits.
  spider_spit: card('spider_spit', 'Spit', 2, 'Closes up to 3, then spits for 4 at range 2.', [
    { kind: 'advance', amount: 3 },
    { kind: 'damage', amount: 4 },
  ]),
  spider_scuttle: card('spider_scuttle', 'Scuttle', 2, 'Scuttles up to 6 toward you.', [
    { kind: 'advance', amount: 6 },
  ]),
  spider_brood: card('spider_brood', 'Brood', 2, 'Closes up to 3; its attacks deal 2 more from now on.', [
    { kind: 'advance', amount: 3 },
    { kind: 'power', amount: 2 },
  ]),

  // Chicken — fast and flappy, barely dangerous.
  chicken_peck: card('chicken_peck', 'Peck', 1, 'Closes up to 4 and pecks for 2.', [
    { kind: 'advance', amount: 4 },
    { kind: 'damage', amount: 2 },
  ]),
  chicken_flap: card('chicken_flap', 'Flap', 1, 'Flaps up to 8 toward you.', [
    { kind: 'advance', amount: 8 },
  ]),

  // Wolf — circles in behind its guard, then lunges.
  wolf_lunge: card('wolf_lunge', 'Lunge', 1, 'Closes up to 4 and bites for 6.', [
    { kind: 'advance', amount: 4 },
    { kind: 'damage', amount: 6 },
  ]),
  wolf_circle: card('wolf_circle', 'Circle', 1, 'Closes up to 4 and gains 3 block.', [
    { kind: 'advance', amount: 4 },
    { kind: 'block', amount: 3 },
  ]),

  // Warden — holds the first gate. Never moves.
  warden_maul: card('warden_maul', 'Maul', 2, 'Mauls for 8 at range 2.', [
    { kind: 'damage', amount: 8 },
  ]),
  warden_stand: card('warden_stand', 'Stand', 2, 'Gains 8 block.', [
    { kind: 'block', amount: 8 },
  ]),
  warden_roar: card('warden_roar', 'Roar', 2, 'Its attacks deal 2 more from now on.', [
    { kind: 'power', amount: 2 },
  ]),

  // Wyrm — holds the second gate. Never moves.
  wyrm_fire: card('wyrm_fire', 'Firestorm', 3, 'Burns for 11 at range 3.', [
    { kind: 'damage', amount: 11 },
  ]),
  wyrm_scales: card('wyrm_scales', 'Scales', 3, 'Gains 10 block.', [
    { kind: 'block', amount: 10 },
  ]),
  wyrm_fury: card('wyrm_fury', 'Fury', 3, 'Its attacks deal 3 more from now on.', [
    { kind: 'power', amount: 3 },
  ]),
};

export const intentDef = (id: string): CardDefinition => {
  const def = INTENTS[id];
  if (!def) throw new Error(`unknown enemy card: ${id}`);
  return def;
};
