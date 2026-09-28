/* What a card combines with, read from its effects — so the bot can pick a
   reward for the deck it has, rather than by rarity alone.

   Each card gives some things and needs others. Fire lights fires; Stoke
   and Inferno need fires to heat. Power builds power; Unleash and Power
   Strike spend it. A summon or a tame brings an ally; Pack Tactics and
   Sic 'Em need one. A payoff with nothing in the deck to set it up is a
   dead card, and a setup with payoffs waiting is worth more than its
   rarity says. Nothing here names a card: new content is read the same
   way. */

import { cardDef } from '../app/game/cards/definitions';
import type { CardDefinition, CardInstance } from '../app/game/cards/types';
import { type Effect, isArea, isBoon, isLater, isScaled, isSummon, isTerrain, isTrail, type SimpleEffect } from '../app/game/effects';
import { gemDef } from '../app/game/gems';

export type Tag = 'fire' | 'power' | 'ally' | 'shove';

export interface Role {
  gives: Set<Tag>;
  needs: Set<Tag>;
}

const reads = (effect: SimpleEffect, of: string): boolean => isScaled(effect.amount) && effect.amount.of === of;

/** What these effects give and need. */
export function roleOf(effects: readonly Effect[]): Role {
  const gives = new Set<Tag>();
  const needs = new Set<Tag>();
  const simple = (effect: SimpleEffect): void => {
    if (effect.kind === 'power' && !reads(effect, 'power')) gives.add('power');
    if ((effect.kind === 'damage' || effect.kind === 'losePower') && reads(effect, 'power')) needs.add('power');
    if (effect.kind === 'rekindle' || effect.kind === 'flare' || reads(effect, 'fires')) needs.add('fire');
    if (effect.kind === 'tame') gives.add('ally');
    if (effect.kind === 'command' || effect.kind === 'mend' || reads(effect, 'allies')) needs.add('ally');
    if (effect.kind === 'push' || effect.kind === 'pull') gives.add('shove');
  };
  for (const effect of effects) {
    if (isTerrain(effect)) {
      // What the tile gives whoever is on it counts too: Rallying Ground's
      // power on entering is power.
      for (const tile of [...effect.effects, ...(effect.enter ?? [])]) if (tile.kind === 'power') gives.add('power');
      if (effect.element === 'fire') gives.add('fire');
      // Oil is nothing until a fire finds it.
      if (effect.element === 'oil') needs.add('fire');
    } else if (isTrail(effect)) {
      if (effect.mark.element === 'fire') gives.add('fire');
    } else if (isSummon(effect)) {
      gives.add('ally');
    } else if (isBoon(effect)) {
      if (effect.stat === 'fireDamage' || effect.stat === 'fireMultiplier' || effect.stat === 'fireRounds') needs.add('fire');
      if (effect.stat === 'slamDamage') needs.add('shove');
      if (effect.stat === 'maxAllies') needs.add('ally');
    } else if (isArea(effect)) {
      for (const inner of effect.effects) if (!isLater(inner)) simple(inner);
      // Power handed round a burst is power for the caster too.
      if (effect.effects.some((inner) => inner.kind === 'power')) gives.add('power');
    } else if (!isLater(effect)) {
      simple(effect);
    }
  }
  return { gives, needs };
}

/** A card as it sits in the deck: its own role and its gems'. */
export function roleOfCard(card: CardInstance): Role {
  return roleOf([...cardDef(card.defId).effects, ...(card.gems ?? []).flatMap((id) => gemDef(id).effects)]);
}

/** How much a card is worth adding to this deck, roughly in cards: its
 *  rarity, plus what it has to work with, less if it has nothing. */
export function cardWorth(def: CardDefinition, deck: readonly CardInstance[]): number {
  const role = roleOf(def.effects);
  const roles = deck.map(roleOfCard);
  let worth = { starter: 0, normal: 1, rare: 1.8, mythic: 2.3 }[def.rarity];
  for (const tag of role.needs) {
    const setups = roles.filter((other) => other.gives.has(tag)).length;
    // A payoff with no setup is a dead card; each setup makes it likelier to
    // meet one in a hand.
    worth += setups === 0 ? -3 : Math.min(setups, 4) * 0.5;
  }
  for (const tag of role.gives) {
    const payoffs = roles.filter((other) => other.needs.has(tag)).length;
    worth += Math.min(payoffs, 3) * 0.6;
  }
  return worth;
}
