/* Put validated content where the rules look for it.

   The registries — CARDS, INTENTS, ENTITIES, GEMS, TALISMANS and their id
   lists — are module-level objects that the rest of `app/game` imports
   directly. Installing refills them in place rather than replacing them,
   so everything that imported them early sees the new content, and a
   second install (the editor trying out a draft) simply wins.

   `enabled` is applied here and only here: disabled items are still
   defined, so anything already holding one keeps working, but they are
   left out of every list that offers or spawns things. */

import { CARD_POOL, CARDS, REWARD_POOL, STARTING_DECK } from '../cards/definitions';
import { INTENTS } from '../cards/intents';
import type { CardDefinition } from '../cards/types';
import type { Effect, Trigger } from '../effects';
import { ENEMY_IDS, ENTITIES, GUARDIAN_IDS } from '../entities/definitions';
import { STATIC_ANIMATIONS } from '../entities/types';
import { GEM_IDS, GEMS } from '../gems';
import { ZONES } from '../map/tiles';
import { DEFAULT_REWARD_CONFIG } from '../rewards';
import type { StatModifier } from '../stats';
import { TALISMAN_IDS, TALISMANS } from '../talismans';
import type { Content } from './schema';
import { formatIssue, validateContent } from './validate';

function refill<T>(list: T[], items: T[]): void {
  list.splice(0, list.length, ...items);
}

function replaceAll<T>(record: Record<string, T>, items: Array<[string, T]>): void {
  for (const key of Object.keys(record)) delete record[key];
  for (const [key, value] of items) record[key] = value;
}

/** Install content that has already passed validation. */
export function installContent(content: Content): void {
  // Player cards.
  replaceAll(CARDS, content.cards.map((card) => [card.id, { ...card, effects: card.effects as Effect[] }]));
  const enabledCards = content.cards.filter((card) => card.enabled);
  refill(CARD_POOL, enabledCards.map((card) => card.id));
  refill(REWARD_POOL, enabledCards.filter((card) => card.rarity !== 'starter').map((card) => card.id));
  refill(STARTING_DECK, content.run.startingDeck);

  // Enemy cards: the fixed parts every one of them shares are filled in.
  replaceAll(INTENTS, content['enemy-cards'].map((card): [string, CardDefinition] => [card.id, {
    ...card,
    effects: card.effects as Effect[],
    cost: 0,
    rarity: 'normal',
    targeting: 'enemy',
  }]));

  // Enemies join the player, who is defined in code.
  for (const [id, def] of Object.entries(ENTITIES)) if (def.faction === 'enemy') delete ENTITIES[id];
  for (const enemy of content.enemies) {
    ENTITIES[enemy.id] = {
      id: enemy.id,
      name: enemy.name,
      faction: 'enemy',
      maxHp: enemy.maxHp,
      sprite: { kind: 'sheet', ...enemy.sprite },
      animations: STATIC_ANIMATIONS,
      deck: enemy.deck,
      reward: enemy.reward,
      guardian: enemy.guardian,
      enabled: enemy.enabled,
    };
  }
  const enabledEnemies = content.enemies.filter((enemy) => enemy.enabled);
  refill(ENEMY_IDS, enabledEnemies.filter((enemy) => !enemy.guardian).map((enemy) => enemy.id));
  refill(GUARDIAN_IDS, enabledEnemies.filter((enemy) => enemy.guardian).map((enemy) => enemy.id));

  // Gems and talismans, and the default reward tables that offer them.
  replaceAll(GEMS, content.gems.map((gem) => [gem.id, { ...gem, effects: gem.effects as Effect[] }]));
  refill(GEM_IDS, content.gems.filter((gem) => gem.enabled).map((gem) => gem.id));
  replaceAll(DEFAULT_REWARD_CONFIG.gemWeights, GEM_IDS.map((id) => [id, 1]));

  replaceAll(TALISMANS, content.talismans.map((talisman) => [talisman.id, {
    ...talisman,
    modifiers: talisman.modifiers as StatModifier[] | undefined,
    triggers: talisman.triggers as Trigger[] | undefined,
  }]));
  refill(TALISMAN_IDS, content.talismans.filter((talisman) => talisman.enabled).map((talisman) => talisman.id));

  // Who lives in each zone. The zone objects are the ones the world already
  // holds, so a chunk built earlier sees the change too.
  for (const zone of ZONES) {
    const table = content.zones.find((item) => item.id === zone.id);
    zone.enemies = [...(table?.enemies ?? [])];
    zone.density = table?.density ?? 0;
    zone.guardian = table?.guardian;
  }
}

/** Validate raw content and install it, or throw with every error listed.
 *  Warnings are returned, for whoever wants to show them. */
export function loadContent(raw: Record<string, unknown>): string[] {
  const { content, issues } = validateContent(raw as Parameters<typeof validateContent>[0]);
  if (!content) {
    const errors = issues.filter((issue) => issue.level === 'error').map(formatIssue);
    throw new Error(`The game content has problems:\n${errors.join('\n')}`);
  }
  installContent(content);
  return issues.map(formatIssue);
}
